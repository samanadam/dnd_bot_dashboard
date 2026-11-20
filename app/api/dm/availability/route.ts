import { availabilityDeps } from "@/lib/availability/routeDeps";
import { availabilityCollection } from "@/lib/availability/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return availabilityCollection(availabilityDeps()).GET(request);
}

export async function PUT(request: Request) {
  return availabilityCollection(availabilityDeps()).PUT(request);
}
