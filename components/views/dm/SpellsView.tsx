"use client";

import { useState } from "react";
import { CampaignSwitcher } from "@/components/CampaignSelect";
import { DmHeader } from "@/components/dm/DmHeader";
import { FeatBrowser } from "@/components/dm/spells/FeatBrowser";
import { SpellBrowser } from "@/components/dm/spells/SpellBrowser";

const TABS = [
  { id: "spells", label: "Spells" },
  { id: "feats", label: "Feats" },
] as const;

export function SpellsView() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("spells");
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
