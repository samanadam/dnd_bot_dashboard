import { requireAccess } from "@/lib/access/server";

// Every page below checks again itself: layouts are not re-run on every client
// navigation, so they must never be the only gate.
export default async function PlayLayout({ children }: LayoutProps<"/play">) {
  await requireAccess("play");
  return children;
}
