import { z } from "zod";
import { campaignIdSchema, parseSelectionStrict } from "@/lib/campaign/selection";
import { errorResponse } from "@/lib/requestGuard";
import { guardDm, invalidBody, readDmJson, type CampaignScope, type DmGuardDeps } from "./guard";
import { json, noContent, type AuditLog } from "./http";
import { MAX_STORY_NOTES, storyNoteSchema, storyNoteUpdateSchema, STORY_ID, type StoryNote, type StoryRepo } from "./story";

// Handlers for /api/dm/story and below. Every write answers with the note as the
// page shows it (with backlinks and unresolved links), so the browser learns the
// new version.

export type StoryRouteDeps = DmGuardDeps & {
  story: () => StoryRepo;
  log?: AuditLog;
};

export type StoryDetail = {
  note: StoryNote;
  backlinks: { id: string; title: string }[];
  /** Titles this note links to that no note has. */
  missing: string[];
};

// Story bodies reach 50 000 characters, more than the DM default of 64 KiB allows in UTF-8.
const BODY_LIMIT = 256 * 1024;
const starterSchema = z.object({ campaignId: campaignIdSchema.nullable() }).strict();

const missing = () => errorResponse(404, "not_found", "No such note.");
const conflict = () => errorResponse(409, "conflict", "This note was changed somewhere else. Reload it and try again.");
const duplicate = () => errorResponse(409, "conflict", "Another note in this campaign already has that title.");

function detail(deps: StoryRouteDeps, note: StoryNote, status = 200): Response {
  const repo = deps.story();
  const summary = repo.list(note.campaignId ?? "unassigned").find((s) => s.id === note.id);
  return json({ note, backlinks: repo.backlinks(note.id), missing: summary?.missing ?? [] } satisfies StoryDetail, status);
}

/** The note, when it exists and the caller's campaign scope reaches it. */
function reachable(deps: StoryRouteDeps, scope: CampaignScope, id: string): StoryNote | null {
  const note = STORY_ID.test(id) ? deps.story().get(id) : null;
  return note && scope.allows(note.campaignId) ? note : null;
}

function audit(deps: StoryRouteDeps, userId: string, method: string, path: string, status: number) {
  deps.log?.({ event: "dm_write", userId, method, path, status });
}

export function storyCollection(deps: StoryRouteDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const campaign = parseSelectionStrict(new URL(request.url).searchParams.get("campaign"));
      if (!campaign.ok) return errorResponse(400, "bad_request", "Invalid campaign.");
      const scoped = guard.scope.narrow(campaign.selection);
      if (scoped === undefined) return missing();
      return json(deps.story().list(scoped));
    },

    async POST(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request, BODY_LIMIT);
      if (!body.ok) return body.response;
      const parsed = storyNoteSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      if (!guard.scope.allows(parsed.data.campaignId ?? null)) return missing();
      const created = deps.story().create(parsed.data);
      if (created === "duplicate") return duplicate();
      if (created === "limit") return errorResponse(409, "conflict", `That is the most notes one campaign can hold (${MAX_STORY_NOTES}). Delete some first.`);
      audit(deps, guard.userId, "POST", "dm/story/notes", 201);
      return detail(deps, created, 201);
    },
  };
}

export function storyItem(deps: StoryRouteDeps) {
  return {
    async GET(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const note = reachable(deps, guard.scope, id);
      return note ? detail(deps, note) : missing();
    },

    async PUT(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!STORY_ID.test(id)) return missing();
      const body = await readDmJson(request, BODY_LIMIT);
      if (!body.ok) return body.response;
      const parsed = storyNoteUpdateSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      if (!reachable(deps, guard.scope, id)) return missing();
      if (parsed.data.campaignId !== undefined && !guard.scope.allows(parsed.data.campaignId)) return missing();
      const { version, ...input } = parsed.data;
      const updated = deps.story().update(id, version, input);
      if (!updated) return missing();
      if (updated === "conflict") return conflict();
      if (updated === "duplicate") return duplicate();
      audit(deps, guard.userId, "PUT", "dm/story/notes/:id", 200);
      return detail(deps, updated);
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!reachable(deps, guard.scope, id) || !deps.story().delete(id)) return missing();
      audit(deps, guard.userId, "DELETE", "dm/story/notes/:id", 204);
      return noContent();
    },
  };
}

export function storyStarter(deps: StoryRouteDeps) {
  return {
    /** Fills an empty campaign with the starter notes: `{ campaignId }`. */
    async POST(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = starterSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      if (!guard.scope.allows(parsed.data.campaignId)) return missing();
      const seeded = deps.story().seedStarter(parsed.data.campaignId);
      audit(deps, guard.userId, "POST", "dm/story/starter", 200);
      return json({ seeded });
    },
  };
}
