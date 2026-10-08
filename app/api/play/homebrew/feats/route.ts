import { homebrewDeps } from "@/lib/play/routeDeps";
import { homebrewCollection } from "@/lib/play/homebrewRoutes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return homebrewCollection(homebrewDeps(), "feats").GET(request);
}

export async function POST(request: Request) {
  return homebrewCollection(homebrewDeps(), "feats").POST(request);
}
