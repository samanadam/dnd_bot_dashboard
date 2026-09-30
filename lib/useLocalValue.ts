"use client";

import { useCallback, useSyncExternalStore } from "react";
import { inDemo } from "@/lib/demo/base";

// Per-device convenience memory (e.g. the last voice channel id). Never store
// anything sensitive here. Storage can be unavailable; that is fine.

const listeners = new Set<() => void>();

// The demo keeps its own values, so trying it never changes the real portal's.
const scoped = (key: string) => (inDemo() ? `demo.${key}` : key);

function read(key: string): string {
  try {
    return window.localStorage.getItem(scoped(key)) ?? "";
  } catch {
    return "";
  }
}

export function useLocalValue(key: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => read(key),
    () => "",
  );
  const set = useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(scoped(key), next);
      } catch {
        // Storage blocked (private mode etc.): the value just is not remembered.
      }
      listeners.forEach((listener) => listener());
    },
    [key],
  );
  return [value, set];
}
