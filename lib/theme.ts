// Every theme is the same set of tokens. The root layout writes the chosen
// theme's tokens as CSS variables on <html>, and the settings page does the
// same live, so adding a theme is one entry here.

export type ThemeTokens = {
  scheme: "dark" | "light";
  bg: string;
  glow1: string;
  glow2: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentStrong: string;
  accentFg: string;
  accent2: string;
  ok: string;
  warn: string;
  danger: string;
  dangerFg: string;
};

export type Theme = { id: string; label: string; description: string; tokens: ThemeTokens };

const dark = { scheme: "dark" as const, dangerFg: "#1a0508" };
const light = { scheme: "light" as const, dangerFg: "#ffffff" };

export const THEMES = [
  {
    id: "arcane",
    label: "Arcane",
    description: "Night blue with violet and cyan light",
    tokens: { ...dark, bg: "#080912", glow1: "#7c6cff", glow2: "#22d3ee", surface: "#10121f", surface2: "#171a2b", surface3: "#1f2338", border: "#252a42", borderStrong: "#353b5c", text: "#eceefb", muted: "#959bba", faint: "#636a8c", accent: "#a394ff", accentStrong: "#8b7aff", accentFg: "#0d0a24", accent2: "#3dd6f5", ok: "#3ddc97", warn: "#f7c04a", danger: "#ff6b81" },
  },
  {
    id: "ember",
    label: "Ember",
    description: "Warm tavern dark, amber and rose",
    tokens: { ...dark, bg: "#0d0a08", glow1: "#f59e42", glow2: "#f43f5e", surface: "#16110d", surface2: "#1f1813", surface3: "#2a2119", border: "#33281f", borderStrong: "#4a3a2c", text: "#f5ebdf", muted: "#b0a08e", faint: "#7d6f60", accent: "#f7a24b", accentStrong: "#f28c28", accentFg: "#1c0f03", accent2: "#fb7185", ok: "#7fd48a", warn: "#f5c542", danger: "#ff7a6b" },
  },
  {
    id: "daylight",
    label: "Daylight",
    description: "Clean and bright, indigo accent",
    tokens: { ...light, bg: "#f4f5fb", glow1: "#5b4ee6", glow2: "#0891b2", surface: "#ffffff", surface2: "#f1f2f9", surface3: "#e7e9f4", border: "#e0e3ef", borderStrong: "#c9cde0", text: "#13162a", muted: "#5a6180", faint: "#8a90aa", accent: "#5b4ee6", accentStrong: "#4a3dd6", accentFg: "#ffffff", accent2: "#0891b2", ok: "#05875f", warn: "#b45309", danger: "#d92d3a" },
  },
  {
    id: "elderwood",
    label: "Elderwood",
    description: "Deep forest green and moss gold",
    tokens: { ...dark, bg: "#070c09", glow1: "#34d399", glow2: "#d9b44a", surface: "#0e1611", surface2: "#142018", surface3: "#1b2a20", border: "#22342a", borderStrong: "#314a3c", text: "#e6f2ea", muted: "#93ab9c", faint: "#607a6a", accent: "#4ade80", accentStrong: "#22c55e", accentFg: "#04130a", accent2: "#e0bb52", ok: "#4ade80", warn: "#facc15", danger: "#f87171" },
  },
  {
    id: "abyss",
    label: "Abyss",
    description: "Ocean depths, teal and sea glass",
    tokens: { ...dark, bg: "#050b10", glow1: "#14b8a6", glow2: "#3b82f6", surface: "#0b141c", surface2: "#101d28", surface3: "#172735", border: "#1d3040", borderStrong: "#2b4659", text: "#e3f1f7", muted: "#8aa8b8", faint: "#5a7686", accent: "#2dd4bf", accentStrong: "#14b8a6", accentFg: "#021513", accent2: "#60a5fa", ok: "#34d399", warn: "#fbbf24", danger: "#fb7185" },
  },
  {
    id: "bloodmoon",
    label: "Blood Moon",
    description: "Crimson on black, for dark campaigns",
    tokens: { ...dark, bg: "#0b0506", glow1: "#e11d48", glow2: "#9f1239", surface: "#140a0c", surface2: "#1d0f12", surface3: "#281519", border: "#35191f", borderStrong: "#4d242c", text: "#f7e7ea", muted: "#b5949a", faint: "#7e6167", accent: "#fb4d6d", accentStrong: "#e11d48", accentFg: "#1a0207", accent2: "#f59e0b", ok: "#4ade80", warn: "#fbbf24", danger: "#ff8a8a" },
  },
  {
    id: "void",
    label: "Void",
    description: "True black with icy blue, OLED friendly",
    tokens: { ...dark, bg: "#000000", glow1: "#38bdf8", glow2: "#6366f1", surface: "#0a0a0c", surface2: "#111114", surface3: "#1a1a1f", border: "#1f1f25", borderStrong: "#2e2e36", text: "#f2f4f8", muted: "#9aa0ad", faint: "#666b77", accent: "#7dd3fc", accentStrong: "#38bdf8", accentFg: "#01121c", accent2: "#a5b4fc", ok: "#4ade80", warn: "#facc15", danger: "#f87171" },
  },
  {
    id: "dungeon",
    label: "Dungeon",
    description: "Cold stone lit by torchlight",
    tokens: { ...dark, bg: "#0c0d0e", glow1: "#f97316", glow2: "#78716c", surface: "#151618", surface2: "#1c1e21", surface3: "#25282c", border: "#2c2f34", borderStrong: "#3e4249", text: "#ebe9e6", muted: "#a19d97", faint: "#6f6b66", accent: "#fb923c", accentStrong: "#f97316", accentFg: "#1a0b02", accent2: "#fcd34d", ok: "#86efac", warn: "#fde047", danger: "#fca5a5" },
  },
  {
    id: "twilight",
    label: "Twilight",
    description: "Dusk purple fading into orange",
    tokens: { ...dark, bg: "#0d0814", glow1: "#c026d3", glow2: "#fb923c", surface: "#150e1f", surface2: "#1d142b", surface3: "#271b38", border: "#2f2242", borderStrong: "#44315e", text: "#f3eafb", muted: "#a996bd", faint: "#766487", accent: "#e879f9", accentStrong: "#d946ef", accentFg: "#1c0420", accent2: "#fdba74", ok: "#4ade80", warn: "#fcd34d", danger: "#fb7185" },
  },
  {
    id: "parchment",
    label: "Parchment",
    description: "Old paper and sepia ink",
    tokens: { ...light, bg: "#f3ede1", glow1: "#b45309", glow2: "#7c2d12", surface: "#fbf7ef", surface2: "#f0e8d8", surface3: "#e6dbc5", border: "#ddd0b8", borderStrong: "#c8b797", text: "#2b2116", muted: "#6e5d49", faint: "#9a8871", accent: "#9a4a12", accentStrong: "#7c3a0c", accentFg: "#fffaf0", accent2: "#3f6212", ok: "#3f7a2a", warn: "#a16207", danger: "#b42318" },
  },
  {
    id: "frost",
    label: "Frost",
    description: "Pale ice with glacier blue",
    tokens: { ...light, bg: "#eef4f9", glow1: "#0284c7", glow2: "#7dd3fc", surface: "#ffffff", surface2: "#eaf2f8", surface3: "#dce8f2", border: "#d4e1ec", borderStrong: "#b6c9d9", text: "#0f1d2a", muted: "#4f6577", faint: "#8397a8", accent: "#0369a1", accentStrong: "#075985", accentFg: "#ffffff", accent2: "#0d9488", ok: "#047857", warn: "#b45309", danger: "#c81e1e" },
  },
  {
    id: "blossom",
    label: "Blossom",
    description: "Soft light theme with rose accent",
    tokens: { ...light, bg: "#fbf3f6", glow1: "#db2777", glow2: "#a855f7", surface: "#ffffff", surface2: "#f8ecf1", surface3: "#f1dde6", border: "#eed7e1", borderStrong: "#dbb8c7", text: "#2a1320", muted: "#77566a", faint: "#a78797", accent: "#be185d", accentStrong: "#9d174d", accentFg: "#ffffff", accent2: "#7e22ce", ok: "#047857", warn: "#b45309", danger: "#c81e3a" },
  },
] satisfies Theme[];

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_COOKIE = "portal-theme";
export const DEFAULT_THEME: ThemeId = "arcane";

/** Cookie values are user-controlled: only known ids survive. */
export function parseTheme(value: string | undefined): ThemeId {
  return THEMES.some((theme) => theme.id === value) ? (value as ThemeId) : DEFAULT_THEME;
}

export function getTheme(id: ThemeId): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

function alpha(hex: string, a: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`;
}

/** CSS custom properties for a theme. Values come only from the table above. */
export function themeVars(id: ThemeId): Record<string, string> {
  const t = getTheme(id).tokens;
  const isLight = t.scheme === "light";
  return {
    colorScheme: t.scheme,
    "--bg": t.bg,
    "--bg-glow-1": alpha(t.glow1, isLight ? 0.08 : 0.15),
    "--bg-glow-2": alpha(t.glow2, isLight ? 0.06 : 0.08),
    "--surface": t.surface,
    "--surface-2": t.surface2,
    "--surface-3": t.surface3,
    "--border": t.border,
    "--border-strong": t.borderStrong,
    "--text": t.text,
    "--muted": t.muted,
    "--faint": t.faint,
    "--accent": t.accent,
    "--accent-strong": t.accentStrong,
    "--accent-fg": t.accentFg,
    "--accent-soft": alpha(t.accent, isLight ? 0.1 : 0.14),
    "--accent-2": t.accent2,
    "--ok": t.ok,
    "--warn": t.warn,
    "--danger": t.danger,
    "--danger-fg": t.dangerFg,
    "--shadow": isLight
      ? "0 1px 2px rgb(19 22 42 / 0.05), 0 10px 30px -14px rgb(19 22 42 / 0.18)"
      : "0 1px 0 rgb(255 255 255 / 0.04) inset, 0 12px 32px -12px rgb(0 0 0 / 0.6)",
  };
}
