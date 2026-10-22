import { parseTheme, type ThemeId } from "@/lib/theme";

// One dice set per theme, made to sit on that theme's page. The body is drawn
// from a pattern (two colours and a few specks); the numbers are carved in and
// filled with ink that can be metal (gold leaf) or glow (enamel lit from inside).

export type DicePattern = "marble" | "nebula" | "stone" | "swirl" | "pearl";

export type DiceSkin = {
  name: string;
  pattern: DicePattern;
  /** Body colour and the colour of its veins, clouds or grain. */
  base: string;
  vein: string;
  /** Tiny flecks in the body (stars, mica), or null. */
  speck: string | null;
  ink: string;
  inkMetal: boolean;
  /** 0 for plain ink; up to ~1.5 for ink that lights up. */
  inkGlow: number;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  iridescence: number;
  /** How strongly the room around the dice shows in their shine. */
  reflections: number;
};

export const DICE_SKINS: Record<ThemeId, DiceSkin> = {
  arcane: {
    name: "Astral amethyst",
    pattern: "nebula",
    base: "#2a1d6b",
    vein: "#8b7aff",
    speck: "#d6f6ff",
    ink: "#5fe3ff",
    inkMetal: false,
    inkGlow: 1.3,
    roughness: 0.22,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    iridescence: 0.25,
    reflections: 1.1,
  },
  ember: {
    name: "Tavern amber",
    pattern: "marble",
    base: "#b4560f",
    vein: "#ffc56b",
    speck: null,
    ink: "#fff1d6",
    inkMetal: false,
    inkGlow: 0,
    roughness: 0.18,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 0,
    reflections: 1,
  },
  daylight: {
    name: "Porcelain",
    pattern: "pearl",
    base: "#f7f6fb",
    vein: "#dcd8f3",
    speck: null,
    ink: "#4a3dd6",
    inkMetal: false,
    inkGlow: 0,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    iridescence: 0.15,
    reflections: 0.8,
  },
  elderwood: {
    name: "Old jade",
    pattern: "marble",
    base: "#0f5132",
    vein: "#6fe0a3",
    speck: null,
    ink: "#e0bb52",
    inkMetal: true,
    inkGlow: 0,
    roughness: 0.24,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    iridescence: 0,
    reflections: 1,
  },
  abyss: {
    name: "Sea glass",
    pattern: "swirl",
    base: "#0b5f63",
    vein: "#5eead4",
    speck: "#c7fff6",
    ink: "#effffc",
    inkMetal: false,
    inkGlow: 0.25,
    roughness: 0.2,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    iridescence: 0.6,
    reflections: 1.1,
  },
  bloodmoon: {
    name: "Garnet",
    pattern: "swirl",
    base: "#4a0414",
    vein: "#e11d48",
    speck: null,
    ink: "#f5b544",
    inkMetal: true,
    inkGlow: 0,
    roughness: 0.16,
    metalness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: 0,
    reflections: 1.2,
  },
  void: {
    name: "Obsidian",
    pattern: "pearl",
    base: "#07080b",
    vein: "#1b2433",
    speck: "#7dd3fc",
    ink: "#8fdcff",
    inkMetal: false,
    inkGlow: 1.5,
    roughness: 0.12,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    iridescence: 0.35,
    reflections: 1.3,
  },
  dungeon: {
    name: "Torchlit granite",
    pattern: "stone",
    base: "#4b4f55",
    vein: "#8e8a84",
    speck: "#1d1f22",
    ink: "#ff9a3d",
    inkMetal: false,
    inkGlow: 0.9,
    roughness: 0.72,
    metalness: 0,
    clearcoat: 0.15,
    clearcoatRoughness: 0.6,
    iridescence: 0,
    reflections: 0.6,
  },
  twilight: {
    name: "Dusk opal",
    pattern: "swirl",
    base: "#7a1f9e",
    vein: "#ff9a5a",
    speck: "#ffe8f9",
    ink: "#fff6ff",
    inkMetal: false,
    inkGlow: 0.2,
    roughness: 0.2,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    iridescence: 0.7,
    reflections: 1,
  },
  parchment: {
    name: "Carved bone",
    pattern: "stone",
    base: "#eadbbb",
    vein: "#c6ab7a",
    speck: "#8a6c43",
    ink: "#5a2a0c",
    inkMetal: false,
    inkGlow: 0,
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
    iridescence: 0,
    reflections: 0.7,
  },
  frost: {
    name: "Glacier ice",
    pattern: "marble",
    base: "#d6ebfb",
    vein: "#7cc2ef",
    speck: "#ffffff",
    ink: "#064f7f",
    inkMetal: false,
    inkGlow: 0,
    roughness: 0.14,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: 0.4,
    reflections: 1.1,
  },
  blossom: {
    name: "Rose quartz",
    pattern: "marble",
    base: "#f6c3d8",
    vein: "#fff1f6",
    speck: null,
    ink: "#9a5a1e",
    inkMetal: true,
    inkGlow: 0,
    roughness: 0.2,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    iridescence: 0.3,
    reflections: 1,
  },
};

/** The set for the theme on the page right now; unknown themes get the default's. */
export function skinForTheme(theme: string | undefined): DiceSkin {
  return DICE_SKINS[parseTheme(theme)];
}
