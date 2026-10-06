import "server-only";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { env } from "@/lib/env";
import { PORTRAIT_FILE, type PortraitStore } from "./portraitRoutes";

// Portraits on the portal's own disk, beside the database. Every file is a
// fresh WebP the server encoded itself: never the upload, never its metadata.

function dir(): string {
  const path = join(env().PORTAL_DATA_DIR, "portraits");
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return path;
}

export const diskPortraits: PortraitStore = {
  async encode(bytes) {
    return sharp(bytes, { animated: false, limitInputPixels: 40_000_000 })
      .rotate()
      .resize(512, 512, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  },
  save(encoded) {
    const name = `${randomBytes(16).toString("hex")}.webp`;
    writeFileSync(join(dir(), name), encoded, { mode: 0o600, flag: "wx" });
    return name;
  },
  read(name) {
    if (!PORTRAIT_FILE.test(name)) return null;
    try {
      return readFileSync(join(dir(), name));
    } catch {
      return null;
    }
  },
  remove(name) {
    if (PORTRAIT_FILE.test(name)) rmSync(join(dir(), name), { force: true });
  },
};
