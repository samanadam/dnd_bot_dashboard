// Structured audit trail on stdout. Every portal user acts through the same bot
// token, so this log is the only record of who did what. Callers pass fields
// explicitly; never pass tokens, cookies, headers or request bodies.

type AuditEvent = {
  event: "sign_in" | "session_revoked" | "bot_call" | "bot_refused";
  userId?: string;
  outcome?: string;
  method?: string;
  path?: string;
  status?: number;
  detail?: string;
};

export function audit(entry: AuditEvent) {
  if (process.env.NODE_ENV === "test") return;
  console.info(JSON.stringify({ at: new Date().toISOString(), type: "audit", ...entry }));
}
