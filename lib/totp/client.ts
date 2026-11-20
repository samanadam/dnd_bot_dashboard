"use client";

import { dmCall } from "@/lib/dm/client";

export type TotpStatus = "none" | "pending" | "active";
export type TotpSetup = { secret: string; uri: string; qr: string };

export const TOTP_KEY = ["totp"] as const;

export const totpApi = {
  status: () => dmCall<{ status: TotpStatus }>("GET", "totp"),
  setup: () => dmCall<TotpSetup>("POST", "totp/setup"),
  confirm: (code: string) => dmCall<{ status: "active" }>("POST", "totp/confirm", { code }),
  remove: () => dmCall<{ removed: true }>("DELETE", "totp"),
  users: () => dmCall<{ users: { userId: string; displayName: string }[] }>("GET", "totp/users"),
  removeUser: (userId: string) => dmCall<{ removed: true }>("DELETE", "totp/users", { userId }),
};
