"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConflictError, dm } from "@/lib/dm/client";
import type { Encounter } from "@/lib/dm/encounter";
import type { StoredEncounter } from "@/lib/dm/encounters";

export type SaveStatus = "saved" | "pending" | "saving" | "offline" | "conflict";

const SAVE_DELAY_MS = 500;
const RETRY_DELAY_MS = 3000;

/**
 * Local-first encounter state. Every change applies at once and is saved a
 * moment later; saves run one at a time, each based on the version the server
 * last confirmed. If another tab saved first, saving stops until the DM
 * chooses which version to keep.
 */
export function useEncounter(initial: StoredEncounter) {
  const [encounter, setEncounter] = useState<Encounter>(initial.encounter);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [conflict, setConflict] = useState<StoredEncounter | null>(null);

  const latest = useRef(initial.encounter);
  const version = useRef(initial.version);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const blocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failed = useRef(false);

  const schedule = useCallback((delay: number, run: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, delay);
  }, []);

  const flush = useCallback(async () => {
    if (inFlight.current || !dirty.current || blocked.current) return;
    inFlight.current = true;
    dirty.current = false;
    setStatus("saving");
    const snapshot = latest.current;
    try {
      const saved = await dm.saveEncounter(initial.id, version.current, snapshot);
      version.current = saved.version;
      failed.current = false;
      setStatus(dirty.current ? "pending" : "saved");
    } catch (error) {
      if (error instanceof ConflictError) {
        blocked.current = true;
        setConflict(error.current);
        setStatus("conflict");
      } else {
        dirty.current = true;
        failed.current = true;
        setStatus("offline");
      }
    } finally {
      inFlight.current = false;
      if (dirty.current && !blocked.current) {
        schedule(failed.current ? RETRY_DELAY_MS : SAVE_DELAY_MS, () => void flush());
      }
    }
  }, [initial.id, schedule]);

  const apply = useCallback(
    (change: (current: Encounter) => Encounter) => {
      if (blocked.current) return;
      const next = change(latest.current);
      if (next === latest.current) return;
      latest.current = next;
      dirty.current = true;
      setEncounter(next);
      setStatus("pending");
      schedule(SAVE_DELAY_MS, () => void flush());
    },
    [flush, schedule],
  );

  /** Keep what the other tab saved and drop local changes. */
  const acceptServerVersion = useCallback(() => {
    if (!conflict) return;
    latest.current = conflict.encounter;
    version.current = conflict.version;
    dirty.current = false;
    blocked.current = false;
    setEncounter(conflict.encounter);
    setConflict(null);
    setStatus("saved");
  }, [conflict]);

  /** Keep this tab's state and save it over the other version. */
  const keepMine = useCallback(() => {
    if (!conflict) return;
    version.current = conflict.version;
    blocked.current = false;
    dirty.current = true;
    setConflict(null);
    setStatus("pending");
    schedule(0, () => void flush());
  }, [conflict, flush, schedule]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) event.preventDefault();
    };
    const online = () => {
      if (dirty.current && !blocked.current) void flush();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("online", online);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  return { encounter, apply, status, conflict, acceptServerVersion, keepMine };
}
