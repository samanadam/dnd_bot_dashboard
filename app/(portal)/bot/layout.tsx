import { BotStatusBanner } from "@/components/bot/BotStatusBanner";
import { requireAnyAccess } from "@/lib/access/server";

export default async function BotLayout({ children }: LayoutProps<"/bot">) {
  // Any one bot permission opens the section; each page checks its own.
  await requireAnyAccess(["bot.view", "bot.recording", "bot.music", "bot.sessions", "bot.manage"]);
  return (
    <div className="space-y-6">
      <BotStatusBanner />
      {children}
    </div>
  );
}
