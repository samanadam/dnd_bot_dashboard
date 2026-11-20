import { describe, expect, it } from "vitest";
import { buildNudge, telegramNotifier } from "@/lib/availability/notify";

function fakeFetch(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response("{}", { status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe("buildNudge", () => {
  it("names one day", () => {
    const nudge = buildNudge(["2026-11-28"]);
    expect(nudge.text).toBe("Everyone is free on Sat 28 Nov. Session day set?");
    expect(decodeURIComponent(nudge.shareUrl.split("text=")[1])).toBe("Session day set to Sat 28 Nov");
  });

  it("lists at most three days and shares the earliest", () => {
    const nudge = buildNudge(["2026-11-28", "2026-11-29", "2026-12-05", "2026-12-06"]);
    expect(nudge.text).toContain("Sat 28 Nov, Sun 29 Nov, Sat 5 Dec");
    expect(nudge.text).not.toContain("6 Dec");
    expect(decodeURIComponent(nudge.shareUrl.split("text=")[1])).toBe("Session day set to Sat 28 Nov");
  });
});

describe("telegramNotifier", () => {
  it("posts the message with a Share to WhatsApp button", async () => {
    const { calls, impl } = fakeFetch();
    await telegramNotifier("123:abc", "42", impl)(buildNudge(["2026-11-28"]));
    expect(calls[0].url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.chat_id).toBe("42");
    expect(body.text).toBe("Everyone is free on Sat 28 Nov. Session day set?");
    expect(body.parse_mode).toBeUndefined();
    const button = body.reply_markup.inline_keyboard[0][0];
    expect(button.text).toBe("Share to WhatsApp");
    expect(button.url.startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("rejects on a non-2xx answer", async () => {
    await expect(telegramNotifier("t", "1", fakeFetch(500).impl)(buildNudge(["2026-11-28"]))).rejects.toThrow();
  });

  it("rejects when the network fails", async () => {
    const impl = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(telegramNotifier("t", "1", impl)(buildNudge(["2026-11-28"]))).rejects.toThrow();
  });
});
