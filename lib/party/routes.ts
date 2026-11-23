import { createHash, timingSafeEqual } from "node:crypto";
import type { UserRepo } from "@/lib/access/grants";
import { can } from "@/lib/access/permissions";
import { CAMPAIGN_ID } from "@/lib/campaign/selection";
import { guardApi, guardDm, invalidBody, readDmJson, type DmGuardDeps } from "@/lib/dm/guard";
import { json, noContent, type AuditLog } from "@/lib/dm/http";
import { errorResponse, readLimited } from "@/lib/requestGuard";
import { canManage } from "@/lib/sheets/access";
import { z } from "zod";
import { channelSchema, PARTY_NOTE_ID, partyNoteSchema, type PartyNote, type PartyNoteRepo } from "./store";

// Party notes: a campaign's shared notes, mirrored with a Discord text channel.
// Players and the DM write them here (/api/play/party-notes) and the bot reports
// what is said in the channel (/api/bot-sync/party-notes, bearer BOT_API_TOKEN).

type Channel = { id: string; name: string; category: string | null };

export type BotNotes = {
  post: (channelId: string, author: string, text: string) => Promise<string | null>;
  edit: (channelId: string, messageId: string, author: string, text: string) => Promise<unknown>;
  remove: (channelId: string, messageId: string) => Promise<unknown>;
};

export type PartyDeps = DmGuardDeps & {
  notes: () => PartyNoteRepo;
  users: () => UserRepo;
  bot: BotNotes;
  channels: () => Promise<Channel[] | null>;
  botToken: () => string;
  log?: AuditLog;
};

const missing = () => errorResponse(404, "not_found", "No such campaign.");

function view(note: PartyNote, viewerId: string, canDelete: boolean) {
  return { id: note.id, author: note.authorName, text: note.text, createdAt: note.createdAt, updatedAt: note.updatedAt, mine: note.authorUserId === viewerId, canDelete: canDelete || note.authorUserId === viewerId };
}

export function partyNotes(deps: PartyDeps) {
  async function allowed(request: Request, forCampaign?: string) {
    const campaignId = forCampaign ?? new URL(request.url).searchParams.get("campaign") ?? "";
    const guard = await guardApi(request, deps, "signed-in");
    if (!guard.ok) return { ok: false as const, response: guard.response };
    if (!CAMPAIGN_ID.test(campaignId) || !(can(guard.access, "play", campaignId) || canManage(guard.access, campaignId) || can(guard.access, "dm", campaignId))) {
      return { ok: false as const, response: missing() };
    }
    return { ok: true as const, guard, campaignId, isDm: can(guard.access, "dm", campaignId) };
  }

  async function mine(request: Request, id: string) {
    const note = PARTY_NOTE_ID.test(id) ? deps.notes().get(id) : null;
    if (!note) return { ok: false as const, response: errorResponse(404, "not_found", "No such note.") };
    // The note's own campaign decides access, whatever the URL says.
    const found = await allowed(request, note.campaignId);
    if (!found.ok) return found;
    return { ok: true as const, found, note };
  }

  return {
    async GET(request: Request): Promise<Response> {
      const found = await allowed(request);
      if (!found.ok) return found.response;
      const campaignId = found.campaignId;
      return json({
        channelSet: deps.notes().channelOf(campaignId) !== null,
        notes: deps.notes().list(campaignId).map((n) => view(n, found.guard.userId, found.isDm)),
      });
    },

    async POST(request: Request): Promise<Response> {
      const found = await allowed(request);
      if (!found.ok) return found.response;
      const campaignId = found.campaignId;
      const body = await readDmJson(request, 8 * 1024);
      if (!body.ok) return body.response;
      const parsed = partyNoteSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const author = deps.users().get(found.guard.userId)?.displayName ?? "Player";
      const note = deps.notes().create({ campaignId, authorUserId: found.guard.userId, authorName: author, text: parsed.data.text });
      if (!note) return errorResponse(409, "conflict", "This campaign has too many notes. Delete some first.");
      const channelId = deps.notes().channelOf(campaignId);
      if (channelId) {
        const messageId = await deps.bot.post(channelId, author, note.text);
        if (messageId) deps.notes().setMessageId(note.id, messageId);
      }
      deps.log?.({ event: "play_write", userId: found.guard.userId, method: "POST", path: "play/party-notes", status: 201 });
      return json(view(deps.notes().get(note.id)!, found.guard.userId, found.isDm), 201);
    },

    async PUT(request: Request, id: string): Promise<Response> {
      const found = await mine(request, id);
      if (!found.ok) return found.response;
      const own = found;
      if (own.note.authorUserId !== own.found.guard.userId) return errorResponse(404, "not_found", "No such note.");
      const body = await readDmJson(request, 8 * 1024);
      if (!body.ok) return body.response;
      const parsed = partyNoteSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const updated = deps.notes().update(id, parsed.data.text)!;
      const channelId = deps.notes().channelOf(updated.campaignId);
      if (channelId && updated.discordMessageId) await deps.bot.edit(channelId, updated.discordMessageId, updated.authorName, updated.text);
      return json(view(updated, own.found.guard.userId, own.found.isDm));
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const found = await mine(request, id);
      if (!found.ok) return found.response;
      const own = found;
      // The author or the campaign's DM.
      if (own.note.authorUserId !== own.found.guard.userId && !own.found.isDm) return errorResponse(404, "not_found", "No such note.");
      deps.notes().remove(id);
      const channelId = deps.notes().channelOf(own.note.campaignId);
      if (channelId && own.note.discordMessageId) await deps.bot.remove(channelId, own.note.discordMessageId);
      return noContent();
    },
  };
}

/** The DM picks the text channel a campaign's party notes mirror to. */
export function partyNotesChannel(deps: PartyDeps) {
  async function allowed(request: Request, campaignId: string) {
    const guard = await guardDm(request, deps);
    if (!guard.ok) return { ok: false as const, response: guard.response };
    if (!CAMPAIGN_ID.test(campaignId) || !guard.scope.allows(campaignId)) return { ok: false as const, response: missing() };
    return { ok: true as const, guard };
  }
  return {
    async GET(request: Request, campaignId: string): Promise<Response> {
      const found = await allowed(request, campaignId);
      if (!found.ok) return found.response;
      return json({ channelId: deps.notes().channelOf(campaignId), channels: await deps.channels() });
    },

    async PUT(request: Request, campaignId: string): Promise<Response> {
      const found = await allowed(request, campaignId);
      if (!found.ok) return found.response;
      const body = await readDmJson(request, 1024);
      if (!body.ok) return body.response;
      const parsed = channelSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      if (parsed.data.channelId) {
        const channels = await deps.channels();
        if (!channels) return errorResponse(503, "bot_unreachable", "The bot must be online to check the channel.");
        if (!channels.some((c) => c.id === parsed.data.channelId)) return errorResponse(400, "bad_request", "The bot cannot read that channel.");
      }
      if (!deps.notes().setChannel(campaignId, parsed.data.channelId)) return errorResponse(409, "conflict", "Another campaign already uses that channel.");
      deps.log?.({ event: "dm_write", userId: found.guard.userId, method: "PUT", path: "dm/campaigns/:id/notes-channel", status: 200 });
      return json({ channelId: parsed.data.channelId });
    },
  };
}

const syncEvent = z
  .object({
    event: z.enum(["create", "edit", "delete"]),
    channel_id: z.string().regex(/^\d{17,20}$/),
    message_id: z.string().regex(/^\d{17,20}$/),
    author_id: z.string().regex(/^\d{17,20}$/).optional(),
    author_name: z.string().max(100).optional(),
    text: z.string().max(4000).optional(),
  })
  .strict();

/** The bot's side: which channels to watch, and what was said, edited or deleted in them. */
export function partyNotesSync(deps: PartyDeps) {
  /** null when the bearer token is right, else the refusal. */
  function bearer(request: Request): Response | null {
    const header = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
    const hash = (value: string) => createHash("sha256").update(value).digest();
    return header && timingSafeEqual(hash(header), hash(deps.botToken())) ? null : errorResponse(401, "unauthorized", "Bad token.");
  }
  return {
    async GET(request: Request): Promise<Response> {
      const who = bearer(request);
      if (who) return who;
      return json(deps.notes().channels().map((c) => ({ campaign_id: c.campaignId, channel_id: c.channelId })));
    },

    async POST(request: Request): Promise<Response> {
      const who = bearer(request);
      if (who) return who;
      const text = await readLimited(request, 16 * 1024);
      let raw: unknown = null;
      try {
        raw = text ? JSON.parse(text) : null;
      } catch {
        raw = null;
      }
      const parsed = syncEvent.safeParse(raw);
      if (!parsed.success) return errorResponse(400, "bad_request", "Bad event.");
      const e = parsed.data;
      const repo = deps.notes();
      const campaignId = repo.campaignOf(e.channel_id);
      if (!campaignId) return json({ ok: true, ignored: true });
      const existing = repo.byMessage(e.message_id);
      const body = (e.text ?? "").trim().slice(0, 1500);
      if (e.event === "delete") {
        if (existing) repo.remove(existing.id);
      } else if (e.event === "edit") {
        if (existing && existing.authorUserId === e.author_id && body) repo.update(existing.id, body);
      } else if (!existing && body && e.author_id) {
        const name = (e.author_name ?? "").replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 80) || "Discord user";
        repo.create({ campaignId, authorUserId: e.author_id, authorName: name, text: body, discordMessageId: e.message_id });
      }
      return json({ ok: true });
    },
  };
}
