"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CampaignSwitcher } from "@/components/CampaignSelect";
import { DmHeader } from "@/components/dm/DmHeader";
import { FeatBrowser } from "@/components/dm/spells/FeatBrowser";
import { SpellBrowser } from "@/components/dm/spells/SpellBrowser";

const TABS = [
  { id: "spells", label: "Spells" },
  { id: "feats", label: "Feats" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SpellsView() {
  // The search params hook needs a boundary for pages rendered ahead of time (the demo).
  return (
    <Suspense>
      <SpellsTabs />
    </Suspense>
  );
}

/** The open tab lives in the URL (?tab=feats), so a link or a reload keeps it. */
function SpellsTabs() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: TabId = params.get("tab") === "feats" ? "feats" : "spells";
  const setTab = (next: TabId) => {
    const query = new URLSearchParams(params.toString());
    if (next === "spells") query.delete("tab");
    else query.set("tab", next);
    const search = query.toString();
    router.replace(`${pathname}${search ? `?${search}` : ""}`, { scroll: false });
  };
  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="Spells and feats"
        description="Every spell and feat from the free SRD, and the ones you and your players invent. Character sheets point at these."
        action={<CampaignSwitcher />}
      />
      <div role="tablist" aria-label="Library" className="flex gap-1 rounded-xl border border-border bg-bg/40 p-1 sm:w-fit">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            id={`library-tab-${option.id}`}
            aria-selected={tab === option.id}
            aria-controls={`library-panel-${option.id}`}
            onClick={() => setTab(option.id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${tab === option.id ? "bg-surface-3 text-text shadow-card" : "text-muted hover:text-text"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`library-panel-${tab}`} aria-labelledby={`library-tab-${tab}`}>
        {tab === "spells" ? <SpellBrowser /> : <FeatBrowser />}
      </div>
    </div>
  );
}
