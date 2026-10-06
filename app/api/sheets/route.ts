import { sheetDeps } from "@/lib/sheets/routeDeps";
import { sheetCollection } from "@/lib/sheets/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return sheetCollection(sheetDeps()).GET(request);
}

export async function POST(request: Request) {
  return sheetCollection(sheetDeps()).POST(request);
}
