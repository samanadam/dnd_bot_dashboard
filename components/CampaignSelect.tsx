"use client";

import { useCampaigns } from "@/lib/bot/useBotState";
import { useCampaignSelection } from "@/lib/campaign/useSelection";
import { inputBaseClass } from "./ui";

/**
 * Pick the campaign something belongs to. Archived campaigns are hidden unless
 * they are the current value, so an old session can still show where it sits.
 */
export function CampaignSelect({
  value,
  onChange,
  noneLabel = "No campaign",
  label,
  disabled,
  compact,
  id,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  noneLabel?: string;
  label: string;
  disabled?: boolean;
  compact?: boolean;
  id?: string;
}) {
  const campaigns = useCampaigns();
  const options = (campaigns.data ?? []).filter((campaign) => !campaign.archived || campaign.id === value);
  const known = options.some((campaign) => campaign.id === value);

  return (
    <select
      id={id}
      aria-label={label}
      disabled={disabled || campaigns.isPending}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
      className={`${inputBaseClass} ${compact ? "h-8 max-w-44 px-2 text-xs" : "h-11 w-full"}`}
    >
      <option value="">{noneLabel}</option>
      {value && !known ? <option value={value}>Unknown campaign</option> : null}
      {options.map((campaign) => (
        <option key={campaign.id} value={campaign.id}>
          {campaign.name}
          {campaign.archived ? " (archived)" : ""}
        </option>
      ))}
    </select>
  );
}

/** The DM Screen's "which campaign am I looking at" filter. */
export function CampaignSwitcher() {
  const [selection, setSelection] = useCampaignSelection();
  const campaigns = useCampaigns();
  const options = (campaigns.data ?? []).filter((campaign) => !campaign.archived || campaign.id === selection);

  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      Campaign
      <select
        value={selection ?? ""}
        onChange={(event) => setSelection(event.target.value || null)}
        className={`${inputBaseClass} h-9 max-w-52 px-2.5`}
      >
        <option value="">All campaigns</option>
        <option value="unassigned">Not in a campaign</option>
        {selection && selection !== "unassigned" && !options.some((campaign) => campaign.id === selection) ? (
          <option value={selection}>Unknown campaign</option>
        ) : null}
        {options.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name}
          </option>
        ))}
      </select>
    </label>
  );
}
