import { AccessSettings } from "@/components/settings/AccessSettings";
import { PageHeader } from "@/components/ui";

export function AccessView() {
  return (
    <div className="space-y-6">
      <PageHeader title="Access" description="Which Discord roles may use what, and in which campaigns." />
      <AccessSettings />
    </div>
  );
}
