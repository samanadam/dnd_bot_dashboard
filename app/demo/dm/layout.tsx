import { DiceProvider } from "@/components/dm/DiceProvider";

export default function DemoDmLayout({ children }: LayoutProps<"/demo/dm">) {
  return <DiceProvider>{children}</DiceProvider>;
}
