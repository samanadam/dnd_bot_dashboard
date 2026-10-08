import { describe, expect, it } from "vitest";
import { resolveAccess } from "@/lib/access/permissions";
import { openDatabase } from "@/lib/dm/db";
import { RateLimiter } from "@/lib/rateLimit";
import { sheetPortrait, sniffImage, type PortraitStore } from "@/lib/sheets/portraitRoutes";
import { SheetRepo } from "@/lib/sheets/repo";

const OWNER = "100000000000000001";
const ARIA = "100000000000000002";
const BRAM = "100000000000000003";
const ROLE = "200000000000000001";
const EMBER = "aaaaaaaaaaaa";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

function setup() {
  const db = openDatabase(":memory:");
  const files = new Map<string, Buffer>();
  let n = 0;
  const portraits: PortraitStore = {
    encode: async () => Buffer.from("WEBPDATA"),
    save: (encoded) => {
      const name = `${String(++n).padStart(32, "0")}.webp`;
      files.set(name, encoded);
      return name;
    },
    read: (name) => files.get(name) ?? null,
    remove: (name) => void files.delete(name),
  };
  let as = ARIA;
  const deps = {
    getAccess: async () => resolveAccess(as, [ROLE], [OWNER], [{ roleId: ROLE, permissions: ["play"], scope: [EMBER] }]),
    limiter: new RateLimiter(),
    sheets: () => new SheetRepo(db),
    portraits,
  };
  const sheet = new SheetRepo(db).create({ campaignId: EMBER, ownerUserId: ARIA, edition: "2024", name: "Aria" });
  if (sheet === "limit") throw new Error("limit");
  return { deps, files, id: sheet.id, act: (user: string) => (as = user) };
}

const put = (body: Buffer, type = "image/png") =>
  new Request("https://portal.example/api/sheets/x/portrait", {
    method: "PUT",
    body: new Uint8Array(body),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", "content-type": type, "content-length": String(body.length) },
  });
const get = () => new Request("https://portal.example/api/sheets/x/portrait", { headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin" } });

describe("portraits", () => {
  it("can be loaded by an <img> (no portal header) but never from another site", async () => {
    const { deps, id } = setup();
    await sheetPortrait(deps).PUT(put(PNG), id);
    const img = new Request("https://portal.example/api/sheets/x/portrait", { headers: { "sec-fetch-site": "same-origin" } });
    expect((await sheetPortrait(deps).GET(img, id)).status).toBe(200);
    const foreign = new Request("https://portal.example/api/sheets/x/portrait", { headers: { "sec-fetch-site": "cross-site" } });
    expect((await sheetPortrait(deps).GET(foreign, id)).status).toBe(403);
    // Writes still need the header.
    const bare = new Request("https://portal.example/api/sheets/x/portrait", { method: "PUT", body: new Uint8Array(PNG), headers: { "sec-fetch-site": "same-origin", "content-type": "image/png" } });
    expect((await sheetPortrait(deps).PUT(bare, id)).status).toBe(403);
  });

  it("knows images by their first bytes, not their name", () => {
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniffImage(Buffer.from("RIFF0000WEBPVP8 "))).toBe("webp");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(Buffer.from("GIF89a"))).toBeNull();
  });

  it("stores the re-encoded image, replaces the old one and serves it with safe headers", async () => {
    const { deps, files, id } = setup();
    expect((await sheetPortrait(deps).PUT(put(PNG), id)).status).toBe(204);
    expect((await sheetPortrait(deps).PUT(put(PNG), id)).status).toBe(204);
    expect(files.size).toBe(1);
    const response = await sheetPortrait(deps).GET(get(), id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("WEBPDATA");
  });

  it("refuses a file that only claims to be an image, a wrong type and anything too big", async () => {
    const { deps, id } = setup();
    expect((await sheetPortrait(deps).PUT(put(Buffer.from("<svg/>"), "image/png"), id)).status).toBe(415);
    expect((await sheetPortrait(deps).PUT(put(PNG, "image/svg+xml"), id)).status).toBe(415);
    expect((await sheetPortrait(deps).PUT(put(Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)])), id)).status).toBe(413);
  });

  it("is never shown or changed by another player", async () => {
    const { deps, id, act } = setup();
    await sheetPortrait(deps).PUT(put(PNG), id);
    act(BRAM);
    expect((await sheetPortrait(deps).GET(get(), id)).status).toBe(404);
    expect((await sheetPortrait(deps).PUT(put(PNG), id)).status).toBe(404);
    expect((await sheetPortrait(deps).DELETE(get(), id)).status).toBe(404);
  });
});

describe("portrait encoding", () => {
  it("turns a real image into a small WebP with no metadata", async () => {
    const sharp = (await import("sharp")).default;
    const { diskPortraits } = await import("@/lib/sheets/portraitStore");
    const big = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#884422" } })
      .withExif({ IFD0: { Copyright: "SECRET-EXIF" } })
      .jpeg()
      .toBuffer();
    expect(big.includes(Buffer.from("SECRET-EXIF"))).toBe(true);
    const out = await diskPortraits.encode(big);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(512);
    expect(meta.exif).toBeUndefined();
    expect(out.includes(Buffer.from("SECRET-EXIF"))).toBe(false);
  });
});
