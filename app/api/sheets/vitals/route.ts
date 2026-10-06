import { sheetDeps } from "@/lib/sheets/routeDeps";
import { sheetVitalsBatch } from "@/lib/sheets/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return sheetVitalsBatch(sheetDeps()).GET(request);
}
