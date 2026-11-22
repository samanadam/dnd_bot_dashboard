"use client";

import { useEffect, useRef } from "react";
import type { NoteType } from "@/lib/dm/story";
import { TYPE_COLOR } from "./types";

type GraphNote = { id: string; title: string; type: NoteType; links: string[] };

type Props = {
  notes: GraphNote[];
  selected: string | null;
  query?: string;
  /** Pixels at the right edge covered by a side panel, so a selected node stays in view. */
  inset?: number;
  onSelect: (id: string | null) => void;
};

type Sim = { id: string; title: string; type: NoteType; x: number; y: number; vx: number; vy: number; r: number; deg: number; fixed: boolean };

// Deterministic so the map settles the same way on every load.
function seeded() {
  let s = 11;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** The story map: a note is a node, a [[link]] an edge. Drag, pan, zoom; click to select. */
export function StoryGraph({ notes, selected, query = "", inset = 0, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ selected, query, inset, onSelect });
  const kick = useRef<() => void>(() => {});
  const focus = useRef<(id: string) => void>(() => {});

  useEffect(() => {
    live.current = { selected, query, inset, onSelect };
    kick.current();
  });
  useEffect(() => {
    if (selected) focus.current(selected);
  }, [selected]);

  // Rebuilt only when the set of notes or their links change, not on every render.
  const signature = notes.map((n) => `${n.id}:${n.type}:${n.title}:${n.links.join(",")}`).join("|");

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const rand = seeded();

    const ids = new Set(notes.map((n) => n.id));
    const edges: [string, string][] = [];
    const seen = new Set<string>();
    const degree = new Map<string, number>();
    for (const n of notes) {
      for (const t of n.links) {
        if (!ids.has(t) || t === n.id) continue; // a link to nothing draws no edge
        const k = [n.id, t].sort().join("|");
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push([n.id, t]);
        degree.set(n.id, (degree.get(n.id) ?? 0) + 1);
        degree.set(t, (degree.get(t) ?? 0) + 1);
      }
    }
    const nodes: Sim[] = notes.map((n, i) => {
      const a = (i / Math.max(1, notes.length)) * Math.PI * 2;
      const rad = 120 + rand() * 220;
      const deg = degree.get(n.id) ?? 0;
      return { id: n.id, title: n.title, type: n.type, x: Math.cos(a) * rad, y: Math.sin(a) * rad, vx: 0, vy: 0, deg, r: 8 + Math.sqrt(deg) * 2.4, fixed: false };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = edges.map(([a, b]) => [byId.get(a)!, byId.get(b)!] as const);
    const neighbors = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set()]));
    for (const [a, b] of links) {
      neighbors.get(a.id)!.add(b.id);
      neighbors.get(b.id)!.add(a.id);
    }

    let alpha = 1;
    const tick = () => {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          const d2 = Math.max(dx * dx + dy * dy, 100);
          const d = Math.sqrt(d2);
          const gap = a.r + b.r + 34;
          const push = (16000 / d2 + (d < gap ? (gap - d) * 0.6 : 0)) * alpha;
          dx /= d; dy /= d;
          a.vx -= dx * push; a.vy -= dy * push;
          b.vx += dx * push; b.vy += dy * push;
        }
      }
      for (const [a, b] of links) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        // Hubs link to many notes; a full-strength spring on each would crush them together.
        const f = ((d - (120 + a.r + b.r)) / d) * (0.22 / Math.max(a.deg, b.deg, 1) ** 0.6) * alpha;
        a.vx += dx * f; a.vy += dy * f;
        b.vx -= dx * f; b.vy -= dy * f;
      }
      for (const n of nodes) {
        n.vx -= n.x * 0.006 * alpha; n.vy -= n.y * 0.006 * alpha;
        n.vx *= 0.8; n.vy *= 0.8;
        if (!n.fixed) { n.x += n.vx; n.y += n.vy; }
      }
      alpha = Math.max(alpha * 0.992, 0);
    };
    for (let i = 0; i < 420; i++) tick();
    alpha = 0.02;

    let w = 0, h = 0, dpr = 1;
    const cam = { x: 0, y: 0, k: 1 };
    let dirty = true;
    let camGoal: { x: number; y: number } | null = null;
    let hover: string | null = null;
    let fitted = false, touched = false;

    const cx = () => (w - live.current.inset) / 2;
    const toWorld = (sx: number, sy: number) => ({ x: (sx - cx() - cam.x) / cam.k, y: (sy - h / 2 - cam.y) / cam.k });
    const fit = () => {
      if (nodes.length === 0) return;
      const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
      const bw = Math.max(...xs) - Math.min(...xs) + 120, bh = Math.max(...ys) - Math.min(...ys) + 120;
      cam.k = Math.min(2, w / bw, h / bh);
      cam.x = -((Math.max(...xs) + Math.min(...xs)) / 2) * cam.k;
      cam.y = -((Math.max(...ys) + Math.min(...ys)) / 2) * cam.k;
    };
    focus.current = (id) => {
      const n = byId.get(id);
      if (n) { camGoal = { x: -n.x * cam.k, y: -n.y * cam.k }; dirty = true; }
    };
    kick.current = () => { dirty = true; };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      if (!fitted && w) { fit(); fitted = true; }
      dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const hit = (sx: number, sy: number) => {
      const p = toWorld(sx, sy);
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (Math.hypot(p.x - n.x, p.y - n.y) <= n.r + Math.max(0, 10 / cam.k)) return n;
      }
      return null;
    };

    const draw = () => {
      const { selected: sel, query: q } = live.current;
      const needle = q.trim().toLowerCase();
      const active = hover ?? sel;
      const near = active ? neighbors.get(active) : null;
      const style = getComputedStyle(canvas);
      const text = style.color || "#e8e8f0";
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0b0c18";

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * (cx() + cam.x), dpr * (h / 2 + cam.y));
      const dim = (n: Sim) => (needle && !n.title.toLowerCase().includes(needle) ? 0.15 : 1);

      for (const [a, b] of links) {
        const lit = active && (a.id === active || b.id === active);
        ctx.globalAlpha = Math.min(dim(a), dim(b)) * (lit ? 1 : active ? 0.25 : 0.6);
        ctx.strokeStyle = lit ? TYPE_COLOR[a.id === active ? b.type : a.type] : text;
        ctx.lineWidth = (lit ? 2 : 1) / cam.k ** 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (const n of nodes) {
        const isActive = n.id === active || n.id === sel;
        ctx.globalAlpha = dim(n) * (active && !isActive && !near?.has(n.id) ? 0.35 : 1);
        const color = TYPE_COLOR[n.type];
        const glow = ctx.createRadialGradient(n.x, n.y, n.r * 0.5, n.x, n.y, n.r * (isActive ? 3 : 2));
        glow.addColorStop(0, `${color}${isActive ? "66" : "30"}`);
        glow.addColorStop(1, `${color}00`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * (isActive ? 3 : 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
        if (isActive) {
          ctx.lineWidth = 3 / cam.k ** 0.5;
          ctx.strokeStyle = text;
          ctx.stroke();
        }
        if (cam.k > 0.5 || isActive) {
          ctx.font = `600 ${Math.max(11, 13 / cam.k ** 0.5)}px var(--font-spectral), Georgia, serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.lineJoin = "round";
          ctx.lineWidth = 4;
          ctx.strokeStyle = bg;
          ctx.strokeText(n.title, n.x, n.y + n.r + 5);
          ctx.fillStyle = text;
          ctx.fillText(n.title, n.x, n.y + n.r + 5);
        }
      }
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    const loop = () => {
      if (alpha > 0.005) {
        tick();
        dirty = true;
        if (alpha <= 0.005 && !touched) fit(); // layout finished moving: frame it
      }
      if (camGoal) {
        const dx = camGoal.x - cam.x, dy = camGoal.y - cam.y;
        cam.x += dx * 0.14; cam.y += dy * 0.14;
        if (Math.hypot(dx, dy) < 0.5) camGoal = null;
        dirty = true;
      }
      if (dirty && w) { dirty = false; draw(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // One pointer drags a node or pans, two pinch-zoom; a press that barely moves is a click.
    const pts = new Map<number, { x: number; y: number }>();
    let drag: Sim | null = null, moved = 0, pinch = 0;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const zoomAt = (sx: number, sy: number, factor: number) => {
      const before = toWorld(sx, sy);
      cam.k = Math.min(3.2, Math.max(0.2, cam.k * factor));
      cam.x = sx - cx() - before.x * cam.k;
      cam.y = sy - h / 2 - before.y * cam.k;
      camGoal = null;
      dirty = true;
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      touched = true;
      const p = local(e);
      pts.set(e.pointerId, p);
      moved = 0;
      camGoal = null;
      if (pts.size === 1) drag = hit(p.x, p.y);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); drag = null; }
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      const prev = pts.get(e.pointerId);
      if (!prev) {
        const n = hit(p.x, p.y);
        if ((n?.id ?? null) !== hover) { hover = n?.id ?? null; canvas.style.cursor = n ? "pointer" : "grab"; dirty = true; }
        return;
      }
      pts.set(e.pointerId, p);
      moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
        pinch = d;
      } else if (drag) {
        if (moved > 4) {
          const wp = toWorld(p.x, p.y);
          drag.x = wp.x; drag.y = wp.y; drag.fixed = true; drag.vx = drag.vy = 0;
          alpha = Math.max(alpha, 0.25);
        }
      } else {
        cam.x += p.x - prev.x; cam.y += p.y - prev.y;
        dirty = true;
      }
    };
    const up = (e: PointerEvent) => {
      const p = local(e);
      pts.delete(e.pointerId);
      pinch = 0;
      if (drag) drag.fixed = false;
      if (moved <= 4 && e.type === "pointerup") live.current.onSelect(hit(p.x, p.y)?.id ?? null);
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      touched = true;
      const p = local(e);
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    };
    const leave = () => { if (hover) { hover = null; dirty = true; } };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands for `notes`
  }, [signature]);

  return (
    <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none text-text" role="img"
      aria-label="Map of linked story notes. Use the notes list to open a note by keyboard, or click a node." />
  );
}
