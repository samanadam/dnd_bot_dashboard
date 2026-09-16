// The portal hosts several tools. Adding one means: a folder under
// app/(portal)/<id>, its own server-side proxy under app/api/<id>, and an entry
// here. Each tool keeps its own secrets and allowlist; nothing is shared.

// Icon names map to components in components/AppShell.tsx.
export type IconName = "dice" | "gauge" | "music" | "history" | "sparkles";

export type ToolLink = { href: string; label: string; icon: IconName };

export type Tool = {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: IconName;
  links: ToolLink[];
  status: "live" | "planned";
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
