// The portal hosts several tools. Adding one means: a folder under
// app/(portal)/<id>, its own server-side route handlers under app/api/<id>, and
// an entry here. Each tool keeps its own secrets and allowlist; nothing is shared.

// Icon names map to components in components/icons.ts.
export type IconName =
  | "dice"
  | "gauge"
  | "music"
  | "history"
  | "sparkles"
  | "scroll"
  | "book"
  | "users"
  | "swords"
  | "audio"
  | "search"
  | "map"
  | "gem";

export type ToolLink = { href: string; label: string; icon: IconName };

export type Tool = {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: IconName;
  links: ToolLink[];
  status: "live" | "planned";
  // Only shown to users in DM_USER_IDS. Hiding is cosmetic: pages and routes
  // enforce the same rule on the server.
  dmOnly?: boolean;
};

export const tools: Tool[] = [
  {
    id: "bot",
    name: "D&D Recorder",
    description: "Record sessions, follow transcription and run the table music.",
    href: "/bot",
    icon: "dice",
    status: "live",
    links: [
      { href: "/bot", label: "Overview", icon: "gauge" },
      { href: "/bot/music", label: "Music", icon: "music" },
      { href: "/bot/sessions", label: "Sessions", icon: "history" },
      { href: "/bot/search", label: "Search", icon: "search" },
      { href: "/bot/campaigns", label: "Campaigns", icon: "book" },
    ],
  },
  {
    id: "dm",
    name: "DM Screen",
    description: "Bestiary, NPCs, areas with battles and rewards, items, initiative tracker and dice. Only you can see it.",
    href: "/dm",
    icon: "scroll",
    status: "live",
    dmOnly: true,
    links: [
      { href: "/dm/combat", label: "Combat", icon: "swords" },
      { href: "/dm/bestiary", label: "Bestiary", icon: "book" },
      { href: "/dm/areas", label: "Areas", icon: "map" },
      { href: "/dm/items", label: "Items", icon: "gem" },
      { href: "/dm/npcs", label: "NPCs", icon: "users" },
      { href: "/dm/dice", label: "Dice", icon: "dice" },
      { href: "/dm/soundboard", label: "Sound", icon: "audio" },
    ],
  },
  {
    id: "more",
    name: "More tools",
    description: "Room for the next campaign helper.",
    href: "/",
    icon: "sparkles",
    status: "planned",
    links: [],
  },
];

/** The tools a user may see. */
export function visibleTools(showDm: boolean): Tool[] {
  return tools.filter((tool) => !tool.dmOnly || showDm);
}
