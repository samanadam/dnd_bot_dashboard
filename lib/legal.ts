// Who the legal pages speak for. Set these in .env; every one is optional so
// the pages still render before they are filled in (they then say "the portal
// operator" and point people at the Discord server).
//
//   LEGAL_OPERATOR_NAME   person or company running the portal
//   LEGAL_CONTACT_EMAIL   where privacy and legal requests go
//   LEGAL_GOVERNING_LAW   country or state whose law governs the terms
//
// Bump LEGAL_UPDATED when the text of a page changes in substance.

export const LEGAL_UPDATED = "2 October 2026";

// How long the server's audit log is kept before the host rotates it away.
export const AUDIT_LOG_RETENTION = "90 days";

export type LegalInfo = {
  operator: string;
  email: string | null;
  law: string | null;
};

export function legalInfo(): LegalInfo {
  const clean = (value: string | undefined) => value?.trim() || null;
  return {
    operator: clean(process.env.LEGAL_OPERATOR_NAME) ?? "the portal operator",
    email: clean(process.env.LEGAL_CONTACT_EMAIL),
    law: clean(process.env.LEGAL_GOVERNING_LAW),
  };
}
