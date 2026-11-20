import "server-only";
import { env } from "@/lib/env";
import { formatDay } from "./days";

// The "everyone is free" message goes to the owner on Telegram, with a button
// that opens WhatsApp prefilled so they can post it to the group in one tap.
// The text is a fixed template plus formatted dates: no user input reaches it.

export type Nudge = { text: string; shareUrl: string };
export type Notifier = (nudge: Nudge) => Promise<void>;

const MAX_DAYS = 3;

export function buildNudge(days: readonly string[]): Nudge {
  const shown = days.slice(0, MAX_DAYS).map(formatDay);
  const share = `Session day set to ${shown[0]}`;
  return {
    text: `Everyone is free on ${shown.join(", ")}. Session day set?`,
    shareUrl: `https://wa.me/?text=${encodeURIComponent(share)}`,
  };
}

export function telegramNotifier(token: string, chatId: string, fetchImpl: typeof fetch = fetch): Notifier {
  return async ({ text, shareUrl }) => {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: { inline_keyboard: [[{ text: "Share to WhatsApp", url: shareUrl }]] },
      }),
      signal: AbortSignal.timeout(5_000),
    });
    // The status only: the body can echo the request, which holds the token's URL.
    if (!response.ok) throw new Error(`Telegram answered ${response.status}`);
  };
}

/** The owner's Telegram, or null when it is not configured. */
export function configuredNotifier(): Notifier | null {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = env();
  return token && chatId ? telegramNotifier(token, chatId) : null;
}
