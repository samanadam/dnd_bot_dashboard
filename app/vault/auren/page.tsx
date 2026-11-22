import type { Metadata } from "next";
import { VaultApp } from "@/components/vault/VaultApp";
import data from "@/lib/vault/auren.json";
import type { VaultData } from "@/lib/vault/types";

export const metadata: Metadata = {
  title: "Auren Solvane",
  description: "Background notes for Auren “Sunny” Solvane.",
};

export default function AurenVaultPage() {
  return <VaultApp data={data as VaultData} lang="en" />;
}
