"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Providers";
import { secureRng } from "@/lib/dice/random";
import { DmError } from "@/lib/dm/client";
import type { SheetView } from "@/lib/sheets/access";
import type { SheetBody } from "@/lib/sheets/body";
import { SheetConflictError, sheets } from "@/lib/sheets/client";
import { derive, type Derived } from "@/lib/sheets/derive";
import { applyOps, type Op, type OpResult } from "@/lib/sheets/ops";
import type { Vitals } from "@/lib/sheets/vitals";

export type SaveStatus = "saved" | "pending" | "saving" | "offline" | "conflict";

// Operations whose outcome the server alone decides (dice, spell lookups).
const SERVER_ONLY = new Set<Op["op"]>(["cast", "shortRest", "longRest", "spendHitDie"]);

/**
 * One open sheet. The body autosaves a moment after the last edit, one save at
 * a time, against the version it was loaded at; a newer version elsewhere shows
 * a keep-mine / take-theirs choice. Vitals change through operations, applied
 * here at once and confirmed by the server, and are polled so changes made
 * elsewhere (the DM's tracker, another tab) show up within a few seconds.
 */
export function useSheet(initial: SheetView) {
  const toast = useToast();
  const [view, setView] = useState(initial);
  const [body, setBody] = useState<SheetBody>(initial.body);
  const [vitals, setVitals] = useState<Vitals>(initial.vitals);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [conflict, setConflict] = useState<SheetView | null>(null);
  const version = useRef(initial.version);
  const vitalsVersion = useRef(initial.vitalsVersion);
  const latest = useRef(body);
  const dirty = useRef(false);
  const saving = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightOps = useRef(0);

  const flush = useCallback(async () => {
    if (saving.current) await saving.current;
    if (!dirty.current) return;
    dirty.current = false;
    setStatus("saving");
    const snapshot = latest.current;
    saving.current = (async () => {
      try {
        const saved = await sheets.save(initial.id, version.current, snapshot);
        version.current = saved.version;
        setView(saved);
        setStatus(dirty.current ? "pending" : "saved");
      } catch (error) {
        if (error instanceof SheetConflictError) {
          setConflict(error.current);
          setStatus("conflict");
        } else {
          dirty.current = true;
          setStatus("offline");
          toast("danger", error instanceof DmError ? error.message : "Could not save the sheet.");
        }
      } finally {
        saving.current = null;
      }
    })();
    await saving.current;
  }, [initial.id, toast]);

  const update = useCallback(
    (change: (draft: SheetBody) => SheetBody) => {
      const next = change(structuredClone(latest.current));
      latest.current = next;
      setBody(next);
      dirty.current = true;
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 800);
    },
    [flush],
  );

  const acceptTheirs = useCallback(() => {
    if (!conflict) return;
    version.current = conflict.version;
    latest.current = conflict.body;
    dirty.current = false;
    setBody(conflict.body);
    setView(conflict);
    setConflict(null);
    setStatus("saved");
  }, [conflict]);

  const keepMine = useCallback(() => {
    if (!conflict) return;
    version.current = conflict.version;
    setConflict(null);
    dirty.current = true;
    void flush();
  }, [conflict, flush]);

  const apply = useCallback(
    async (ops: Op[]): Promise<OpResult[] | null> => {
      const before = vitals;
      if (!ops.some((op) => SERVER_ONLY.has(op.op))) {
        const local = applyOps(before, ops, { body: latest.current, edition: view.edition, rng: secureRng, spell: () => null });
        if (!local.ok) {
          toast("danger", local.reason);
          return null;
        }
        setVitals(local.vitals);
      }
      inflightOps.current += 1;
      try {
        const answer = await sheets.ops(initial.id, ops);
        vitalsVersion.current = answer.vitalsVersion;
        setVitals(answer.vitals);
        return answer.results;
      } catch (error) {
        setVitals(before);
        toast("danger", error instanceof DmError ? error.message : "That change did not go through.");
        return null;
      } finally {
        inflightOps.current -= 1;
      }
    },
    [initial.id, toast, view.edition, vitals],
  );

  // Poll vitals: quickly while the tab is visible, slowly while hidden.
  useEffect(() => {
    let stopped = false;
    let handle: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      if (inflightOps.current === 0) {
        try {
          const fresh = await sheets.vitals(initial.id, vitalsVersion.current);
          if (fresh && inflightOps.current === 0) {
            vitalsVersion.current = fresh.vitalsVersion;
            setVitals(fresh.vitals);
          }
          // Someone else saved the body: take it when nothing local is waiting.
          if (fresh && fresh.version > version.current && !dirty.current && !saving.current) {
            const sheet = await sheets.get(initial.id);
            version.current = sheet.version;
            latest.current = sheet.body;
            setBody(sheet.body);
            setView(sheet);
          }
        } catch {
          // Polling is best effort; the next tick tries again.
        }
      }
      handle = setTimeout(() => void tick(), document.visibilityState === "visible" ? 3000 : 30_000);
    };
    handle = setTimeout(() => void tick(), 3000);
    return () => {
      stopped = true;
      clearTimeout(handle);
    };
  }, [initial.id]);

  // Save what is waiting before the page goes away.
  useEffect(() => {
    const leave = () => {
      if (dirty.current) void flush();
    };
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [flush]);

  const derived: Derived = useMemo(() => derive(body, vitals, view.edition), [body, vitals, view.edition]);

  return { view, setView, body, vitals, derived, update, apply, status, conflict, acceptTheirs, keepMine, flush };
}

export type SheetHandle = ReturnType<typeof useSheet>;
