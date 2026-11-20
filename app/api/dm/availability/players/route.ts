import { availabilityDeps } from "@/lib/availability/routeDeps";
import { availabilityPlayers } from "@/lib/availability/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return availabilityPlayers(availabilityDeps()).GET(request);
}

export async function PUT(request: Request) {
  return availabilityPlayers(availabilityDeps()).PUT(request);
}
