import type { NoteType } from "@/lib/dm/story";

export const TYPE_LABEL: Record<NoteType, string> = {
  place: "Place",
  npc: "NPC",
  faction: "Faction",
  event: "Event",
  secret: "Secret",
  plot: "Plot",
  session: "Session",
  other: "Other",
};

// Drawn on the map's canvas, which cannot read CSS variables, so these are fixed
// mid-tone colours that read on the dark and the light themes.
export const TYPE_COLOR: Record<NoteType, string> = {
  place: "#4fc3d9",
  npc: "#f0a35e",
  faction: "#e8678a",
  event: "#a394ff",
  secret: "#e5484d",
  plot: "#f2c14e",
  session: "#7fe3ad",
  other: "#9aa0c4",
};
