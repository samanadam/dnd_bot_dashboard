import { availabilityDeps } from "@/lib/availability/routeDeps";
import { availabilityTest } from "@/lib/availability/routes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return availabilityTest(availabilityDeps()).POST(request);
}
