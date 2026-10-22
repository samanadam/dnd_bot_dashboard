"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ShownDie } from "@/lib/dice/shown";
import { skinForTheme } from "@/lib/dice/skins";
import { getTheme, parseTheme } from "@/lib/theme";
import { useLocalValue } from "@/lib/useLocalValue";
import type { DiceLook, DiceScene } from "./scene";

/** One throw; a new `id` throws again even with the same dice. */
export type Toss = { id: string; dice: ShownDie[] };

export function useDice3d(): [boolean, (on: boolean) => void] {
  const [value, setValue] = useLocalValue("portal.dice3d");
  const set = useCallback((on: boolean) => setValue(on ? "on" : "off"), [setValue]);
  return [value !== "off", set];
}

/** The dice set of the theme on the page right now (it can change live in settings). */
function currentLook(): DiceLook {
  const theme = parseTheme(document.documentElement.dataset.theme);
  // The body sees both the theme tokens on <html> and the font variables.
  const style = getComputedStyle(document.body);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    skin: skinForTheme(theme),
    font: `${token("--font-spectral", "")}, Georgia, serif`.replace(/^, /, ""),
    crit: token("--ok", "#3ddc97"),
    fumble: token("--danger", "#ff6b81"),
    light: getTheme(theme).tokens.scheme === "light",
  };
}

/**
 * Throws the dice across the whole screen, above everything, without taking
 * clicks. Skipped when the visitor turned 3D dice off or asks for less motion,
 * and when WebGL is unavailable: the result card already shows the roll.
 */
export function DiceOverlay({ toss }: { toss: Toss | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Promise<DiceScene | null> | null>(null);
  const [enabled] = useDice3d();

  const sceneFor = useCallback((canvas: HTMLCanvasElement) => {
    sceneRef.current ??= import("./scene")
      .then(({ createDiceScene }) => createDiceScene(canvas))
      .catch(() => null);
    return sceneRef.current;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Load the 3D code, paint the dice and compile their shaders while the page
    // is idle, so the first roll does not wait for any of it.
    const timer = setTimeout(() => void sceneFor(canvas).then((scene) => scene?.warm(currentLook())), 1500);
    return () => clearTimeout(timer);
  }, [enabled, sceneFor]);

  useEffect(
    () => () => {
      void sceneRef.current?.then((scene) => scene?.dispose());
      sceneRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!toss?.dice.length || !enabled || !canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    void sceneFor(canvas).then((scene) => scene?.play(toss.dice, currentLook()));
  }, [toss, enabled, sceneFor]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-50 size-full opacity-0 transition-opacity duration-300" />;
}

export function Dice3dToggle({ id, className = "" }: { id: string; className?: string }) {
  const [on, setOn] = useDice3d();
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-center gap-2 text-xs text-muted ${className}`}>
      <input id={id} type="checkbox" className="size-4 accent-[var(--accent)]" checked={on} onChange={(event) => setOn(event.target.checked)} />
      3D dice
    </label>
  );
}
