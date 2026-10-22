import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Vector3, type Texture } from "three";
import type { DiceSkin } from "@/lib/dice/skins";
import { atlasGrid, faceLabel, type Solid } from "@/lib/dice/solids";
import type { DieKind } from "@/lib/dice/shown";

// Everything a die set is painted with, drawn on canvases: the body pattern,
// and per die shape an atlas of its faces with the numbers, plus the maps that
// carve the numbers in (bump), light them (emissive) or gild them (metal).

const PATTERN = 384;
const CELL = 192;
const FONT_SIZE: Record<DieKind, number> = { 4: 0.2, 6: 0.5, 8: 0.36, 10: 0.36, 12: 0.4, 20: 0.34, 100: 0.3 };

export type DieMaps = { map: Texture; bump: Texture; glow: Texture | null; metal: Texture | null };

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Value noise with a fixed seed, so a skin always looks the same.
function noise(seed: number) {
  let state = seed;
  const next = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000);
  const values = Float32Array.from({ length: 256 }, next);
  const perm = Uint8Array.from({ length: 512 }, (_, i) => i & 255);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const at = (x: number, y: number) => values[perm[(x & 255) + perm[y & 255]]];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const top = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u;
    const bottom = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u;
    return top + (bottom - top) * v;
  };
  return (x: number, y: number, octaves = 5) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * value(x * freq, y * freq);
      freq *= 2;
      amp *= 0.5;
    }
    return sum / (1 - 0.5 ** octaves);
  };
}

const clamp = (t: number) => Math.min(1, Math.max(0, t));
const smoothstep = (a: number, b: number, t: number) => {
  const x = clamp((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/** How far each pixel is from the base colour toward the vein colour. */
function shade(skin: DiceSkin, fbm: ReturnType<typeof noise>, x: number, y: number): number {
  switch (skin.pattern) {
    case "marble": {
      // A few long veins over soft clouds, like polished stone.
      const warp = fbm(x * 1.3, y * 1.3);
      const vein = 1 - Math.abs(Math.sin((x * 0.9 + y * 0.5 + warp * 3.4) * Math.PI));
      const cloud = smoothstep(0.3, 0.8, fbm(x * 1.1 + 7, y * 1.1));
      return clamp(vein ** 9 * 0.85 + cloud * 0.4);
    }
    case "nebula": {
      const q = fbm(x * 1.6, y * 1.6);
      const cloud = fbm(x * 1.6 + q * 2.4 + 3, y * 1.6 + q * 2.4);
      return smoothstep(0.38, 0.82, cloud) * 0.9 + fbm(x * 9, y * 9, 3) * 0.1;
    }
    case "stone":
      return clamp(fbm(x * 5, y * 5) * 0.55 + fbm(x * 22, y * 22, 3) * 0.45 - 0.1);
    case "swirl": {
      const q = fbm(x * 1.4, y * 1.4);
      const r = fbm(x * 1.4 + q * 4 + 1.7, y * 1.4 + q * 4 + 9.2);
      return smoothstep(0.3, 0.75, fbm(x * 1.4 + r * 4, y * 1.4 + r * 4));
    }
    case "pearl":
      return smoothstep(0.35, 0.8, fbm(x * 1.8, y * 1.8)) * 0.6;
  }
}

const patterns = new Map<DiceSkin, HTMLCanvasElement>();

/** The body of a die set: a square tile of the skin's pattern. */
export function patternFor(skin: DiceSkin): HTMLCanvasElement {
  const cached = patterns.get(skin);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PATTERN;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(PATTERN, PATTERN);
  const fbm = noise(skin.name.length * 7919 + skin.base.charCodeAt(1));
  const base = rgb(skin.base);
  const vein = rgb(skin.vein);
  const speck = skin.speck ? rgb(skin.speck) : null;
  let seed = 12345;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let py = 0; py < PATTERN; py++) {
    for (let px = 0; px < PATTERN; px++) {
      const t = shade(skin, fbm, px / 96, py / 96);
      const i = (py * PATTERN + px) * 4;
      let color: Rgb = [base[0] + (vein[0] - base[0]) * t, base[1] + (vein[1] - base[1]) * t, base[2] + (vein[2] - base[2]) * t];
      if (speck) {
        const chance = skin.pattern === "stone" ? 0.05 : 0.004;
        if (rand() < chance) {
          const k = skin.pattern === "stone" ? 0.5 : 0.6 + rand() * 0.4;
          color = [color[0] + (speck[0] - color[0]) * k, color[1] + (speck[1] - color[1]) * k, color[2] + (speck[2] - color[2]) * k];
        }
      }
      image.data.set([color[0], color[1], color[2], 255], i);
    }
  }
  ctx.putImageData(image, 0, 0);
  patterns.set(skin, canvas);
  return canvas;
}

export function bodyTexture(skin: DiceSkin): Texture {
  const texture = new CanvasTexture(patternFor(skin));
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

type Paint = { ctx: CanvasRenderingContext2D; fill: string };

/** Draws every face's number(s) into its cell, in one colour. */
function drawNumbers(solid: Solid, { ctx, fill }: Paint, font: string) {
  const { cols } = atlasGrid(solid.faces.length);
  ctx.fillStyle = fill;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(CELL * FONT_SIZE[solid.kind])}px ${font}`;
  solid.faces.forEach((face, index) => {
    const cx = (index % cols + 0.5) * CELL;
    const cy = (Math.floor(index / cols) + 0.5) * CELL;
    const side = new Vector3().crossVectors(face.up, face.normal);
    // Face point to atlas pixel (canvas y runs down).
    const pixel = (point: Vector3): [number, number] => {
      const offset = point.clone().sub(face.center);
      return [cx + (offset.dot(side) / (2 * solid.faceRadius)) * CELL, cy - (offset.dot(face.up) / (2 * solid.faceRadius)) * CELL];
    };

    if (solid.kind === 4) {
      // Each corner's number sits near that corner, its top pointing at it.
      face.indices.forEach((pointIndex, k) => {
        const vertex = face.vertices[k];
        const [x, y] = pixel(face.center.clone().lerp(vertex, 0.58));
        const [vx, vy] = pixel(vertex);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(vx - x, -(vy - y)));
        ctx.fillText(String(solid.corners[pointIndex].label), 0, 0);
        ctx.restore();
      });
      return;
    }

    const text = faceLabel(solid.kind, face.label);
    const [x, y] = pixel(face.center);
    ctx.save();
    ctx.translate(x, y);
    const width = ctx.measureText(text).width;
    const room = CELL * 0.42;
    if (width > room) ctx.scale(room / width, room / width);
    ctx.fillText(text, 0, 0);
    // 6 and 9 get a bar underneath so they cannot be mixed up.
    if ((text === "6" || text === "9") && solid.kind !== 6 && solid.kind !== 8) {
      const size = CELL * FONT_SIZE[solid.kind];
      ctx.fillRect(-size * 0.22, size * 0.42, size * 0.44, size * 0.07);
    }
    ctx.restore();
  });
}

function canvasFor(solid: Solid): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const { cols, rows } = atlasGrid(solid.faces.length);
  const canvas = document.createElement("canvas");
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  return [canvas, canvas.getContext("2d")!];
}

const texture = (canvas: HTMLCanvasElement, color: boolean) => {
  const result = new CanvasTexture(canvas);
  if (color) result.colorSpace = SRGBColorSpace;
  return result;
};

export function dieMaps(solid: Solid, skin: DiceSkin, font: string): DieMaps {
  const pattern = patternFor(skin);
  const { cols } = atlasGrid(solid.faces.length);

  // Colour: a different part of the pattern on every face, then the ink.
  const [colorCanvas, color] = canvasFor(solid);
  solid.faces.forEach((_, index) => {
    const span = PATTERN * 0.55;
    const sx = ((index * 97) % (PATTERN - span)) | 0;
    const sy = ((index * 61) % (PATTERN - span)) | 0;
    color.drawImage(pattern, sx, sy, span, span, (index % cols) * CELL, Math.floor(index / cols) * CELL, CELL, CELL);
  });
  drawNumbers(solid, { ctx: color, fill: skin.ink }, font);

  // Bump: the numbers sit lower than the face, with a soft rim.
  const [bumpCanvas, bump] = canvasFor(solid);
  bump.fillStyle = "#c8c8c8";
  bump.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);
  bump.filter = "blur(1.5px)";
  drawNumbers(solid, { ctx: bump, fill: "#202020" }, font);

  let glow: Texture | null = null;
  if (skin.inkGlow > 0) {
    const [glowCanvas, ctx] = canvasFor(solid);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
    drawNumbers(solid, { ctx, fill: skin.ink }, font);
    glow = texture(glowCanvas, true);
  }

  // Metal ink: green is roughness and blue metalness, as three.js reads them.
  let metal: Texture | null = null;
  if (skin.inkMetal) {
    const [metalCanvas, ctx] = canvasFor(solid);
    ctx.fillStyle = `rgb(0 ${Math.round(skin.roughness * 255)} ${Math.round(skin.metalness * 255)})`;
    ctx.fillRect(0, 0, metalCanvas.width, metalCanvas.height);
    drawNumbers(solid, { ctx, fill: "rgb(0 70 255)" }, font);
    metal = texture(metalCanvas, false);
  }

  return { map: texture(colorCanvas, true), bump: texture(bumpCanvas, false), glow, metal };
}

/** A soft round glow, white so a material can tint it. */
export function haloTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgb(255 255 255 / 0.9)");
  gradient.addColorStop(0.4, "rgb(255 255 255 / 0.35)");
  gradient.addColorStop(1, "rgb(255 255 255 / 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}
