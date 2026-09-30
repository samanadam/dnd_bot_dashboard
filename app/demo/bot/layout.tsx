import { BotStatusBanner } from "@/components/bot/BotStatusBanner";

export default function DemoBotLayout({ children }: LayoutProps<"/demo/bot">) {
  return (
    <div className="space-y-6">
      <BotStatusBanner />
      {children}
    </div>
  );
}
