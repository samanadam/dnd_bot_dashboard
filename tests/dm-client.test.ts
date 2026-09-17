import { afterEach, describe, expect, it, vi } from "vitest";
import { dm, DmError } from "@/lib/dm/client";

afterEach(() => vi.unstubAllGlobals());

describe("dm client", () => {
  it("sends the portal header, same-origin credentials and JSON", async () => {
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => Response.json({ id: "x" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await dm.createCreature({ kind: "npc" } as never);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/dm/creatures");
    expect((init.headers as Record<string, string>)["x-portal-request"]).toBe("1");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
  });

  it("encodes ids in paths", async () => {
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await dm.deleteCreature("../x?y");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/dm/creatures/..%2Fx%3Fy");
  });

  it("throws DmError with the server code and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { code: "bad_request", message: "Invalid statBlock.hp" } }, { status: 400 })),
    );
    const error = await dm.listCreatures().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DmError);
    expect(error).toMatchObject({ status: 400, code: "bad_request", message: "Invalid statBlock.hp" });
  });

  it("reports network failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(dm.listCreatures()).rejects.toMatchObject({ status: 0, code: "network_error" });
  });
});
