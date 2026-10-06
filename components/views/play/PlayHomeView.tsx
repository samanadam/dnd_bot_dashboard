import { Swords, Users } from "lucide-react";
import { PortalLink } from "@/components/PortalLink";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import type { PlayCampaign } from "@/lib/play/campaigns";

/** The player area's front page: the campaigns this player belongs to. */
export function PlayHomeView({ campaigns }: { campaigns: PlayCampaign[] | null }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Your campaigns" description="Your characters and the battle the DM is running, per campaign." />
      {campaigns === null ? <Notice tone="warn">The campaign list is unavailable right now. Try again in a moment.</Notice> : null}
      {campaigns && campaigns.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-6">
          <EmptyState icon={Users} title="No campaign yet">
            Ask your DM to add you to a campaign.
          </EmptyState>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {(campaigns ?? []).map((campaign) => (
          <PortalLink key={campaign.id} href={`/play/c/${campaign.id}`} className="block">
            <Card title={campaign.name} icon={Swords} className="transition hover:border-border-strong">
              <p className="text-sm text-muted">Characters and battles</p>
            </Card>
          </PortalLink>
        ))}
      </div>
    </div>
  );
}
