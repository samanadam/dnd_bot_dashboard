import type { Metadata } from "next";

// The public character vault. Deliberately no auth(), env(), database or bot here or
// in any page below: it renders lib/vault/*.json, built from notes the player chose
// to publish (scripts/build-vault.mjs). proxy.ts lets /vault through without a session.

export const metadata: Metadata = {
  title: { default: "Vault", template: "%s · Vault" },
  robots: { index: false, follow: false },
};

export default function VaultLayout({ children }: LayoutProps<"/vault">) {
  return children;
}
