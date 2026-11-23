import { describe, expect, it } from "vitest";
import { UserRepo } from "@/lib/access/grants";
import { openDatabase } from "@/lib/dm/db";
import { partyNotes, partyNotesChannel, partyNotesSync, type PartyDeps } from "@/lib/party/routes";
import { PartyNoteRepo } from "@/lib/party/store";
import { RateLimiter } from "@/lib/rateLimit";
import { ownerAccess } from "./helpers/access";

const DM = "111111111111111111";
const CAMPAIGN = "aaaaaaaaaaaa";
const CHANNEL = "444444444444444444";
const TOKEN = "t".repeat(32);

function setup() {
  const db = openDatabase(":memory:");
  const calls: string[] = [];
  const deps = {
    getAccess: ownerAccess(DM, [DM]),
    limiter: new RateLimiter(),
    notes: () => new PartyNoteRepo(db),
    users: () => new UserRepo(db),
    botToken: () => TOKEN,
    channels: async () => [{ id: CHANNEL, name: "notes", category: null }],
    bot: {
      post: async (_c: string, a: string, t: string) => (calls.push(`post ${a}: ${t}`), "555555555555555555"),
      edit: async (_c: string, m: string, _a: string, t: string) => void calls.push(`edit ${m} ${t}`),
      remove: async (_c: string, m: string) => void calls.push(`remove ${m}`),
    },
  } as PartyDeps;
  return { db, deps, calls };
}

const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://portal.example/api/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
  });
const bearer = { authorization: `Bearer ${TOKEN}` };

describe("party notes", () => {
  it("mirrors portal writes to the channel, and Discord events to notes", async () => {
    const { deps, calls } = setup();
    const set = await partyNotesChannel(deps).PUT(req("PUT", "x", { channelId: CHANNEL }), CAMPAIGN);
    expect(set.status).toBe(200);

    const created = await partyNotes(deps).POST(req("POST", `play/party-notes?campaign=${CAMPAIGN}`, { text: "The key is under the mat" }));
    expect(created.status).toBe(201);
    const note = await created.json();
    expect(calls).toEqual([expect.stringContaining("The key is under the mat")]);

    expect((await partyNotes(deps).PUT(req("PUT", "x", { text: "Key is gone" }), note.id)).status).toBe(200);
    expect(calls.at(-1)).toBe("edit 555555555555555555 Key is gone");

    // Said in Discord: becomes a note; deleting it there removes it here.
    const sync = partyNotesSync(deps);
    const said = { event: "create", channel_id: CHANNEL, message_id: "666666666666666666", author_id: "777777777777777777", author_name: "Mira", text: "Meet at dawn" };
    expect((await sync.POST(req("POST", "bot-sync/party-notes", said, bearer))).status).toBe(200);
    let list = await (await partyNotes(deps).GET(req("GET", `play/party-notes?campaign=${CAMPAIGN}`))).json();
    expect(list.notes.map((n: { text: string }) => n.text).sort()).toEqual(["Key is gone", "Meet at dawn"]);

    await sync.POST(req("POST", "bot-sync/party-notes", { ...said, event: "edit", text: "Meet at noon" }, bearer));
    await sync.POST(req("POST", "bot-sync/party-notes", { ...said, event: "delete" }, bearer));
    // An edit by someone other than the author changes nothing.
    await sync.POST(req("POST", "bot-sync/party-notes", { event: "edit", channel_id: CHANNEL, message_id: "555555555555555555", author_id: "777777777777777777", text: "hijack" }, bearer));
    list = await (await partyNotes(deps).GET(req("GET", `play/party-notes?campaign=${CAMPAIGN}`))).json();
    expect(list.notes.map((n: { text: string }) => n.text)).toEqual(["Key is gone"]);

    // Deleting in the portal removes the Discord message.
    expect((await partyNotes(deps).DELETE(req("DELETE", "x"), note.id)).status).toBe(204);
    expect(calls.at(-1)).toBe("remove 555555555555555555");
  });

  it("refuses the bot endpoints without the token and ignores unwatched channels", async () => {
    const { deps } = setup();
    expect((await partyNotesSync(deps).GET(req("GET", "bot-sync/party-notes"))).status).toBe(401);
    expect((await partyNotesSync(deps).GET(req("GET", "bot-sync/party-notes", undefined, { authorization: "Bearer nope" }))).status).toBe(401);
    const said = { event: "create", channel_id: CHANNEL, message_id: "666666666666666666", author_id: "777777777777777777", text: "hi" };
    const answer = await (await partyNotesSync(deps).POST(req("POST", "bot-sync/party-notes", said, bearer))).json();
    expect(answer.ignored).toBe(true);
  });

  it("keeps one channel to one campaign", async () => {
    const { deps } = setup();
    await partyNotesChannel(deps).PUT(req("PUT", "x", { channelId: CHANNEL }), CAMPAIGN);
    expect((await partyNotesChannel(deps).PUT(req("PUT", "x", { channelId: CHANNEL }), "bbbbbbbbbbbb")).status).toBe(409);
  });
});
