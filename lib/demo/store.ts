"use client";

import { useSyncExternalStore } from "react";
import { demoFixtures, type DemoState } from "./fixtures";

// The demo's whole world, held in this browser tab's memory. It starts from the
// fixtures, changes as the visitor clicks around, and is gone on reload. It is
// never sent anywhere.
//
// It refuses to exist on the server: a module-level value there would be shared
// by every visitor, so server renders get null and pages fill in after hydration.

let state: DemoState | null = null;
const listeners = new Set<() => void>();

function current(): DemoState {
  if (typeof window === "undefined") throw new Error("The demo store only exists in the browser.");
  state ??= demoFixtures(Date.now());
  return state;
}

export function readDemo(): DemoState {
  return current();
}

/** Applies a change to a copy, so every change is a new snapshot for React. */
export function updateDemo<T>(recipe: (draft: DemoState) => T): T {
  const next = structuredClone(current());
  const result = recipe(next);
  state = next;
  listeners.forEach((listener) => listener());
  return result;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The demo state, or null while rendering on the server and hydrating. */
export function useDemoState(): DemoState | null {
  return useSyncExternalStore(subscribe, current, () => null);
}

/** Back to the fixtures, for tests. */
export function resetDemo() {
  state = null;
}
