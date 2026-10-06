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

import { can, type Access, type Permission } from "@/lib/access/permissions";

// Each link names the permission its page requires. Hiding is cosmetic: pages
// and routes enforce the same rule on the server.
export type ToolLink = { href: string; label: string; icon: IconName; permission: Permission };

export type Tool = {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: IconName;
  links: ToolLink[];
  status: "live" | "planned";
  // Needed to see the tool's own landing page (its first link opens it too).
  permission?: Permission;
};

export const tools: Tool[] = [
  {
    id: "bot",
    name: "D&D Recorder",
    description: "Record sessions, follow transcription and run the table music.",
    href: "/bot",
    icon: "dice",
    status: "live",
    permission: "bot.view",
    links: [
      { href: "/bot", label: "Overview", icon: "gauge", permission: "bot.view" },
      { href: "/bot/music", label: "Music", icon: "music", permission: "bot.music" },
      { href: "/bot/sessions", label: "Sessions", icon: "history", permission: "bot.sessions" },
      { href: "/bot/search", label: "Search", icon: "search", permission: "bot.sessions" },
      { href: "/bot/campaigns", label: "Campaigns", icon: "book", permission: "bot.view" },
    ],
  },
  {
    id: "dm",
    name: "DM Screen",
    description: "Bestiary, NPCs, areas with battles and rewards, items, spells, initiative tracker and dice.",
    href: "/dm",
    icon: "scroll",
    status: "live",
    permission: "dm",
    links: [
      { href: "/dm/combat", label: "Combat", icon: "swords", permission: "dm" },
      { href: "/dm/bestiary", label: "Bestiary", icon: "book", permission: "dm" },
      { href: "/dm/areas", label: "Areas", icon: "map", permission: "dm" },
      { href: "/dm/items", label: "Items", icon: "gem", permission: "dm" },
      { href: "/dm/spells", label: "Spells", icon: "sparkles", permission: "dm" },
      { href: "/dm/npcs", label: "NPCs", icon: "users", permission: "dm" },
      { href: "/dm/dice", label: "Dice", icon: "dice", permission: "dm" },
      { href: "/dm/soundboard", label: "Sound", icon: "audio", permission: "dm" },
    ],
  },
  {
    id: "play",
    name: "Party",
    description: "Your characters, your spells and the battle the DM is running.",
    href: "/play",
    icon: "users",
    status: "live",
    permission: "play",
    links: [{ href: "/play", label: "My characters", icon: "users", permission: "play" }],
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

/** The tools a user may see, each with only the links they may open. */
export function visibleTools(access: Access): Tool[] {
  return tools.flatMap((tool) => {
    if (tool.status === "planned") return access.owner ? [tool] : [];
    const links = tool.links.filter((link) => can(access, link.permission));
    if (links.length === 0) return [];
    // Without its landing page, the tool's card opens the first page the user can reach.
    const href = tool.permission === undefined || can(access, tool.permission) ? tool.href : links[0].href;
    return [{ ...tool, href, links }];
  });
}
