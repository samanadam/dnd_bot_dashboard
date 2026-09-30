import { AreaDetailView } from "@/components/dm/areas/AreaDetailView";
import { DmHeader } from "@/components/dm/DmHeader";
import type { AreaDetail } from "@/lib/dm/areaView";

// The DM Screen pages without their data source. The portal's pages read the
// database on the server and pass the result in; the demo's pages pass in what
// the browser-side demo store holds. Either way the same UI renders.

export function AreaView({ detail }: { detail: AreaDetail }) {
  const { area } = detail;
  return (
    <div className="space-y-6">
      <DmHeader back={{ href: "/dm/areas", label: "All areas" }} eyebrow="Area" title={area.name} />
      {/* Keyed by id and version so a reload from the server replaces the local copy. */}
      <AreaDetailView key={`${area.id}:${area.version}`} initial={detail} />
    </div>
  );
}
