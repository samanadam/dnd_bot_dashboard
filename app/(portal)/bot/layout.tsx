import { BotStatusBanner } from "@/components/bot/BotStatusBanner";
import { requireUser } from "@/lib/session";

export default async function BotLayout({ children }: LayoutProps<"/bot">) {
  await requireUser();
  return (
    <div className="space-y-6">
      <BotStatusBanner />
      {children}
    </div>
  );
}
