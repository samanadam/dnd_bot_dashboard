"use client";

import { useCallback, useEffect, useState } from "react";
import { PAGE_SOURCE, parseExtMessage, type ExtMessage } from "@/extension/src/bridge";

// Talks to the browser extension through window.postMessage. The extension has a small script
// on this portal's pages (extension/src/portal.ts) that answers; without it nothing answers.

export type ExtensionPresence = { status: "checking" } | { status: "missing" } | { status: "present"; version: string; paired: boolean; live: boolean };

const post = (message: object) => window.postMessage({ source: PAGE_SOURCE, ...message }, window.location.origin);

/** Waits for one answer of the given type from the extension, or null after `ms`. */
function answer<T extends ExtMessage["type"]>(type: T, ms: number): Promise<Extract<ExtMessage, { type: T }> | null> {
  return new Promise((resolve) => {
    const done = (value: Extract<ExtMessage, { type: T }> | null) => {
      window.removeEventListener("message", listen);
      clearTimeout(timer);
      resolve(value);
    };
    const listen = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = parseExtMessage(event.data);
      if (message?.type === type) done(message as Extract<ExtMessage, { type: T }>);
    };
    const timer = setTimeout(() => done(null), ms);
    window.addEventListener("message", listen);
  });
}

/** Whether the extension is installed in this browser (and paired, and live), with a way to pair it. */
export function useExtension() {
  const [presence, setPresence] = useState<ExtensionPresence>({ status: "checking" });

  const check = useCallback(async () => {
    const waiting = answer("present", 1500);
    post({ type: "hello" });
    const found = await waiting;
    setPresence(found ? { status: "present", version: found.version, paired: found.paired, live: found.live } : { status: "missing" });
  }, []);

  useEffect(() => {
    // The extension's script loads after the page; asking once it has had a moment avoids a false "missing".
    const timer = setTimeout(() => void check(), 300);
    return () => clearTimeout(timer);
  }, [check]);

  const pair = useCallback(
    async (token: string): Promise<{ ok: boolean; text: string }> => {
      const waiting = answer("paired", 10_000);
      post({ type: "pair", token });
      const result = (await waiting) ?? { ok: false, text: "The extension did not answer. Reload this page and try again." };
      await check();
      return result;
    },
    [check],
  );

  return { presence, pair, recheck: check };
}
