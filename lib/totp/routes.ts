import { z } from "zod";
import type { PortalUser } from "@/lib/access/grants";
import { guardApi, invalidBody, readDmJson, type DmGuardDeps } from "@/lib/dm/guard";
import { json, type AuditLog } from "@/lib/dm/http";
import type { TotpRepo } from "./repo";
import { checkCode, decryptSecret, encryptSecret, newSecret, otpauthUri } from "./secret";

// /api/dm/totp: setting up and managing "sign in with a code". Routes live under
// /api/dm so the browser's dmCall client is reused; the permission decides who
// may call. Signing in itself is not here: it is a server action on /signin/code.

export type TotpRouteDeps = DmGuardDeps & {
  repo: () => TotpRepo;
  users: () => PortalUser[];
  authSecret: () => string;
  /** The otpauth uri as a QR image data URL. */
  qr: (text: string) => Promise<string>;
  now?: () => number;
  log?: AuditLog;
};

const nowOf = (deps: TotpRouteDeps) => deps.now?.() ?? Date.now();

export function totpSelf(deps: TotpRouteDeps) {
  return {
    /** none | pending | active, for the signed-in user. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      return json({ status: deps.repo().get(guard.userId)?.status ?? "none" });
    },

    /** Turn the user's own code sign-in off. */
    async DELETE(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      deps.repo().remove(guard.userId);
      deps.log?.({ event: "access_change", userId: guard.userId, method: "DELETE", path: "totp", status: 200 });
      return json({ removed: true });
    },
  };
}

export function totpSetup(deps: TotpRouteDeps) {
  return {
    /** A fresh secret: shown once as a QR code and text, stored encrypted and unusable until confirmed. */
    async POST(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const secret = newSecret();
      deps.repo().startSetup(guard.userId, encryptSecret(secret, deps.authSecret()), nowOf(deps));
      const label = deps.users().find((user) => user.userId === guard.userId)?.displayName ?? "player";
      const uri = otpauthUri(secret, label);
      return json({ secret, uri, qr: await deps.qr(uri) });
    },
  };
}

const confirmBody = z.object({ code: z.string().max(12) });

export function totpConfirm(deps: TotpRouteDeps) {
  return {
    /** The player proves the app shows the right code; only then does the card work. */
    async POST(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = confirmBody.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const repo = deps.repo();
      const credential = repo.get(guard.userId);
      const secret = credential?.status === "pending" ? decryptSecret(credential.secretEnc, deps.authSecret()) : null;
      const counter = secret ? checkCode(secret, parsed.data.code.trim(), nowOf(deps)) : null;
      if (counter === null) return invalidBody([{ path: ["code"], message: "wrong code, or no setup in progress" }]);
      repo.activate(guard.userId, counter);
      deps.log?.({ event: "access_change", userId: guard.userId, method: "POST", path: "totp/confirm", status: 200 });
      return json({ status: "active" });
    },
  };
}

const removeBody = z.object({ userId: z.string().regex(/^\d{17,20}$/) });

export function totpAdmin(deps: TotpRouteDeps) {
  return {
    /** Who can currently sign in with a code. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "owner");
      if (!guard.ok) return guard.response;
      const names = new Map(deps.users().map((user) => [user.userId, user.displayName]));
      return json({ users: deps.repo().activeUserIds().map((userId) => ({ userId, displayName: names.get(userId) ?? "Player" })) });
    },

    /** Turn a player's code sign-in off, for example after they left the group. */
    async DELETE(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "owner");
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = removeBody.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      deps.repo().remove(parsed.data.userId);
      deps.log?.({ event: "access_change", userId: guard.userId, method: "DELETE", path: "totp/users", status: 200, detail: parsed.data.userId });
      return json({ removed: true });
    },
  };
}
