import type { Metadata } from "next";
import { VaultApp } from "@/components/vault/VaultApp";
import data from "@/lib/vault/auren.tr.json";
import type { VaultData } from "@/lib/vault/types";

export const metadata: Metadata = {
  title: "Auren Solvane",
  description: "Auren “Sunny” Solvane için geçmiş notları.",
};

export default function AurenVaultTurkishPage() {
  return <VaultApp data={data as VaultData} lang="tr" />;
}
