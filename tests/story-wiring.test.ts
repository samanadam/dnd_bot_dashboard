import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@/lib/dm/db";

// Drives the real route files under app/api/dm/story with the production
// dependency wiring (dmDeps). Only the session, the environment, the audit log
// and the database file are replaced (same approach as areas-wiring.test.ts).

const DM = "111111111111111111";
const state = vi.hoisted(() => ({ user: null as string | null, db: null as unknown }));

vi.mock("@/auth", () => ({ auth: async () => (state.user ? { user: { id: state.user } } : null) }));
vi.mock("@/lib/env", () => ({ env: () => ({ DM_USER_IDS: ["111111111111111111"], ALLOWED_ROLE_IDS: [] }) }));
vi.mock("@/lib/audit", () => ({ audit: () => undefined }));
vi.mock("@/lib/dm/database", () => ({ getDatabase: () => state.db }));

beforeEach(() => {
  state.user = DM;
  state.db = openDatabase(":memory:");
});

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;
const call = (method: string, path: string, body?: unknown) =>
  new Request(`https://portal.example/api/dm/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });

describe("story route files", () => {
  it("create, read, list, update, delete and seed through the real handlers", async () => {
    const collection = await import("@/app/api/dm/story/notes/route");
    const item = await import("@/app/api/dm/story/notes/[id]/route");
    const starter = await import("@/app/api/dm/story/starter/route");

    const created = await (await collection.POST(call("POST", "story/notes", { title: "Inn", type: "place", tags: [], body: "[[Ghost]]", campaignId: null }))).json();
    const id = created.note.id as string;
    expect(created.missing).toEqual(["Ghost"]);
    expect(await (await collection.GET(call("GET", "story/notes"))).json()).toHaveLength(1);
    expect((await item.GET(call("GET", `story/notes/${id}`), ctx({ id }))).status).toBe(200);
    const put = await item.PUT(call("PUT", `story/notes/${id}`, { title: "Inn", type: "place", tags: [], body: "x", version: 1 }), ctx({ id }));
    expect((await put.json()).note.version).toBe(2);
    expect((await item.DELETE(call("DELETE", `story/notes/${id}`), ctx({ id }))).status).toBe(204);
    expect(await (await starter.POST(call("POST", "story/starter", { campaignId: null }))).json()).toEqual({ seeded: 4 });
  });

  it("refuses a signed-out caller", async () => {
    state.user = null;
    const collection = await import("@/app/api/dm/story/notes/route");
    expect((await collection.GET(call("GET", "story/notes"))).status).toBe(401);
  });
});
