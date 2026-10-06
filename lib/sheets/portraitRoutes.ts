import { guardApi, type DmGuardDeps } from "@/lib/dm/guard";
import { noContent, type AuditLog } from "@/lib/dm/http";
import { errorResponse } from "@/lib/requestGuard";
import { canEdit } from "./access";
import { SHEET_ID, type SheetRepo, type StoredSheet } from "./repo";

// A character's picture. Uploads are untrusted: the type is read from the
// file's first bytes, never from the request; the server re-encodes it to a
// small WebP (which drops EXIF location and any animation) and stores that
// under a random name. It is served only to people who may see the sheet, with
// headers that keep a browser from treating it as anything but an image.

export const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;
export const PORTRAIT_FILE = /^[0-9a-f]{32}\.webp$/;

export type PortraitStore = {
  encode: (bytes: Buffer) => Promise<Buffer>;
  save: (encoded: Buffer) => string;
  read: (name: string) => Buffer | null;
  remove: (name: string) => void;
};

export type PortraitRouteDeps = DmGuardDeps & {
  sheets: () => SheetRepo;
  portraits: PortraitStore;
  // Whether this user may see the sheet's picture in a battle they are watching (combat link).
  seenInBattle?: (userId: string, sheet: StoredSheet, battleId: string) => boolean;
  log?: AuditLog;
};

/** png, jpeg or webp by magic bytes; anything else is refused before decoding. */
export function sniffImage(bytes: Buffer): "png" | "jpeg" | "webp" | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

const missing = () => errorResponse(404, "not_found", "No such picture.");

const IMAGE_HEADERS = {
  "Content-Type": "image/webp",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'",
  "Cache-Control": "private, max-age=300",
};

async function editable(request: Request, deps: PortraitRouteDeps, id: string) {
  const guard = await guardApi(request, deps, "signed-in");
  if (!guard.ok) return { ok: false as const, response: guard.response };
  const sheet = SHEET_ID.test(id) ? deps.sheets().get(id) : null;
  if (!sheet || !canEdit(guard.access, sheet)) return { ok: false as const, response: missing() };
  return { ok: true as const, guard, sheet };
}

export function sheetPortrait(deps: PortraitRouteDeps) {
  return {
    /** The picture, for whoever may see the sheet, or (with ?battle=) a battle it is in. */
    async GET(request: Request, id: string): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const sheet = SHEET_ID.test(id) ? deps.sheets().get(id) : null;
      if (!sheet || !sheet.portrait) return missing();
      const battle = new URL(request.url).searchParams.get("battle");
      const allowed = canEdit(guard.access, sheet) || (battle !== null && /^[0-9a-f-]{36}$/.test(battle) && Boolean(deps.seenInBattle?.(guard.userId, sheet, battle)));
      if (!allowed) return missing();
      const bytes = deps.portraits.read(sheet.portrait);
      if (!bytes) return missing();
      return new Response(new Uint8Array(bytes), { headers: IMAGE_HEADERS });
    },

    /** The raw image as the body (image/png, image/jpeg or image/webp), at most 5 MB. */
    async PUT(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (!found.ok) return found.response;
      const type = (request.headers.get("content-type") ?? "").toLowerCase();
      if (!/^image\/(png|jpeg|webp)$/.test(type)) return errorResponse(415, "unsupported_media_type", "Send a PNG, JPEG or WebP image.");
      const declared = Number(request.headers.get("content-length") ?? "0");
      if (declared > MAX_PORTRAIT_BYTES || !request.body) return errorResponse(413, "payload_too_large", "Pictures can be at most 5 MB.");
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PORTRAIT_BYTES) {
          await reader.cancel();
          return errorResponse(413, "payload_too_large", "Pictures can be at most 5 MB.");
        }
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks);
      if (!sniffImage(bytes)) return errorResponse(415, "unsupported_media_type", "That file is not a PNG, JPEG or WebP image.");
      let encoded: Buffer;
      try {
        encoded = await deps.portraits.encode(bytes);
      } catch {
        return errorResponse(400, "bad_request", "That image could not be read.");
      }
      const name = deps.portraits.save(encoded);
      const before = found.sheet.portrait;
      deps.sheets().setPortrait(id, name);
      if (before) deps.portraits.remove(before);
      deps.log?.({ event: "play_write", userId: found.guard.userId, method: "PUT", path: "sheets/:id/portrait", status: 204 });
      return noContent();
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (!found.ok) return found.response;
      if (!found.sheet.portrait) return missing();
      deps.sheets().setPortrait(id, null);
      deps.portraits.remove(found.sheet.portrait);
      deps.log?.({ event: "play_write", userId: found.guard.userId, method: "DELETE", path: "sheets/:id/portrait", status: 204 });
      return noContent();
    },
  };
}

