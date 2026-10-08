import { sheetDeps } from "@/lib/sheets/routeDeps";
import { sheetPlayers } from "@/lib/sheets/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return sheetPlayers(sheetDeps()).GET(request);
}
