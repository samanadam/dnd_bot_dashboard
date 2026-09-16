"use client";

import { BotError } from "@/lib/bot/client";
import { useHealth } from "@/lib/bot/useBotState";
import { Notice } from "../ui";

// Offline / starting are shown by LivePresence. This banner only covers the
// case that needs an operator: the bot is up but rejects the portal's token.
export function BotStatusBanner() {
  const health = useHealth();
  if (health.error instanceof BotError && health.error.code === "bot_auth_failed") {
    return <Notice title="Bot rejected the portal's token">An operator needs to fix BOT_API_TOKEN. Controls are disabled.</Notice>;
  }
  return null;
}
