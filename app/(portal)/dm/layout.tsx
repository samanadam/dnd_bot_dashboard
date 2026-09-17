import { DiceProvider } from "@/components/dm/DiceProvider";
import { requireDm } from "@/lib/dm/access";

// Every page below also calls requireDm() itself: layouts are not re-run on
// every client navigation, so they must never be the only gate.
export default async function DmLayout({ children }: LayoutProps<"/dm">) {
  await requireDm();
  return <DiceProvider>{children}</DiceProvider>;
}
