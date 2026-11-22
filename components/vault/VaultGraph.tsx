"use client";

import { useEffect, useRef } from "react";
import { GROUP_COLOR, HOUSE_COLOR, imageUrl } from "@/lib/vault/base";
import type { Note } from "@/lib/vault/types";

type Props = {
  label: string;
  notes: Note[];
  hub: string;
  selected: string | null;
  query: string;
  /** Pixels of the canvas covered by the note panel, so the focused node stays visible. */
  inset: { right: number; bottom: number };
  onSelect: (id: string | null) => void;
};

type SimNode = {
  id: string; title: string; group: string; house?: string; thumb?: string;
  x: number; y: number; vx: number; vy: number; r: number; fixed: boolean; deg: number;
};

const ringOf = (n: SimNode) => (n.house && HOUSE_COLOR[n.house]) || GROUP_COLOR[n.group] || "#b7a6ff";

// Deterministic so the graph settles the same way on every load.
function seeded() {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function VaultGraph({ label, notes, hub, selected, query, inset, onSelect }: Props) {
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

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const rand = seeded();

    const degree = new Map<string, number>();
    const edges: [string, string][] = [];
    const seen = new Set<string>();
    for (const n of notes) {
      for (const t of n.links) {
        const key = [n.id, t].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push([n.id, t]);
        degree.set(n.id, (degree.get(n.id) ?? 0) + 1);
        degree.set(t, (degree.get(t) ?? 0) + 1);
      }
    }
    const nodes: SimNode[] = notes.map((n, i) => {
      const a = (i / notes.length) * Math.PI * 2;
      const rad = 150 + rand() * 260;
      return {
        id: n.id, title: n.title, group: n.group, house: n.house, thumb: n.thumb,
        x: Math.cos(a) * rad, y: Math.sin(a) * rad, vx: 0, vy: 0, fixed: false, deg: degree.get(n.id) ?? 0,
        r: (n.id === hub ? 26 : 7 + Math.sqrt(degree.get(n.id) ?? 0) * 2) + (n.thumb ? 9 : 0),
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = edges.map(([a, b]) => [byId.get(a)!, byId.get(b)!] as const).filter(([a, b]) => a && b);
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
          const gap = a.r + b.r + 34;
          const d = Math.sqrt(d2);
          const push = (16000 / d2 + (d < gap ? (gap - d) * 0.6 : 0)) * alpha;
          dx /= d; dy /= d;
          a.vx -= dx * push; a.vy -= dy * push;
          b.vx += dx * push; b.vy += dy * push;
        }
      }
      for (const [a, b] of links) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        // Hubs link to dozens of notes; a full-strength spring on each would crush them together.
        const f = ((d - (130 + a.r + b.r)) / d) * (0.22 / Math.max(a.deg, b.deg) ** 0.6) * alpha;
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

    const images = new Map<string, HTMLImageElement>();
    const image = (name: string) => {
      let img = images.get(name);
      if (!img) {
        img = new Image();
        img.onload = () => { dirty = true; };
        img.src = imageUrl(name, true);
        images.set(name, img);
      }
      return img.complete && img.naturalWidth ? img : null;
    };

    const stars = Array.from({ length: 150 }, () => ({ x: rand(), y: rand(), s: 0.4 + rand() * 1.1, a: 0.25 + rand() * 0.6 }));
    let w = 0, h = 0, dpr = 1;
    const cam = { x: 0, y: 0, k: 1 };
    let dirty = true;
    let camGoal: { x: number; y: number } | null = null;
    let hover: string | null = null;
    let fitted = false, touched = false;

    const origin = () => ({ cx: (w - live.current.inset.right) / 2, cy: (h - live.current.inset.bottom) / 2 });
    const toWorld = (sx: number, sy: number) => {
      const { cx, cy } = origin();
      return { x: (sx - cx - cam.x) / cam.k, y: (sy - cy - cam.y) / cam.k };
    };
    const fit = () => {
      const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
      const bw = Math.max(...xs) - Math.min(...xs) + 90, bh = Math.max(...ys) - Math.min(...ys) + 210;
      const { cx, cy } = origin();
      cam.k = Math.min(2, Math.min((cx * 2) / bw, (cy * 2) / bh));
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
        const slop = Math.max(0, 10 / cam.k);
        if (Math.hypot(p.x - n.x, p.y - n.y) <= n.r + slop) return n;
      }
      return null;
    };

    const draw = () => {
      const { selected: sel, query: q } = live.current;
      const needle = q.trim().toLowerCase();
      const active = hover ?? sel;
      const near = active ? neighbors.get(active) : null;
      const { cx, cy } = origin();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        ctx.globalAlpha = s.a;
        ctx.fillStyle = "#dfe3ff";
        ctx.fillRect(((s.x * w + cam.x * 0.06) % w + w) % w, ((s.y * h + cam.y * 0.06) % h + h) % h, s.s, s.s);
      }
      ctx.globalAlpha = 1;

      ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * (cx + cam.x), dpr * (cy + cam.y));
      const dim = (n: SimNode) => (needle && !n.title.toLowerCase().includes(needle) ? 0.14 : 1);

      for (const [a, b] of links) {
        const lit = active && (a.id === active || b.id === active);
        ctx.globalAlpha = Math.min(dim(a), dim(b)) * (lit ? 1 : active ? 0.25 : 0.7);
        ctx.strokeStyle = lit ? "#cdbfff" : "rgba(160,150,230,0.35)";
        ctx.lineWidth = (lit ? 2 : 1) / cam.k ** 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (const n of nodes) {
        const isActive = n.id === active || n.id === sel;
        const faded = active && !isActive && !near?.has(n.id) ? 0.35 : 1;
        ctx.globalAlpha = dim(n) * faded;
        const color = ringOf(n);
        const glow = ctx.createRadialGradient(n.x, n.y, n.r * 0.6, n.x, n.y, n.r * (isActive ? 3.2 : 2.2));
        glow.addColorStop(0, `${color}${isActive ? "66" : "30"}`);
        glow.addColorStop(1, `${color}00`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * (isActive ? 3.2 : 2.2), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#0c0e1d";
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
        const img = n.thumb ? image(n.thumb) : null;
        if (img) {
          ctx.save();
          ctx.clip();
          ctx.drawImage(img, n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = GROUP_COLOR[n.group] ?? color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.lineWidth = (isActive ? 3 : 2) / cam.k ** 0.5;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.stroke();

        if (cam.k > 0.55 || isActive || n.id === hub) {
          const size = Math.max(11, 13 / cam.k ** 0.5);
          ctx.font = `600 ${size}px var(--font-spectral), Georgia, serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.lineJoin = "round";
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(6,7,16,0.92)";
          ctx.strokeText(n.title, n.x, n.y + n.r + 5);
          ctx.fillStyle = isActive ? "#fff" : "#d9d6f0";
          ctx.fillText(n.title, n.x, n.y + n.r + 5);
        }
      }
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    const loop = () => {
      if (alpha > 0.005) {
        tick(); dirty = true;
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

    // Pointers: one drags a node or pans, two pinch-zoom; a press that barely moves is a click.
    const pts = new Map<number, { x: number; y: number }>();
    let drag: SimNode | null = null, moved = 0, pinch = 0;
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const zoomAt = (sx: number, sy: number, factor: number) => {
      const before = toWorld(sx, sy);
      cam.k = Math.min(3.2, Math.max(0.25, cam.k * factor));
      const { cx, cy } = origin();
      cam.x = sx - cx - before.x * cam.k;
      cam.y = sy - cy - before.y * cam.k;
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
      const p = local(e as unknown as PointerEvent);
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
  }, [notes, hub]);

  return (
    <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" role="img"
      aria-label={label} />
  );
}
