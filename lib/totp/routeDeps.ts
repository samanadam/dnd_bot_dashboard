import "server-only";
import QRCode from "qrcode";
import { UserRepo } from "@/lib/access/grants";
import { getAccess } from "@/lib/access/server";
import { audit } from "@/lib/audit";
import { getDatabase } from "@/lib/dm/database";
import { env } from "@/lib/env";
import { TotpRepo } from "./repo";
import type { TotpRouteDeps } from "./routes";

export function totpDeps(): TotpRouteDeps {
  return {
    getAccess,
    repo: () => new TotpRepo(getDatabase()),
    users: () => new UserRepo(getDatabase()).list(),
    authSecret: () => env().AUTH_SECRET,
    qr: (text) => QRCode.toDataURL(text, { margin: 1, width: 220 }),
    log: audit,
  };
}
