import { PortalLink } from "@/components/PortalLink";

const TABS = [
  { id: "overview", href: "/dm/story", label: "Overview" },
  { id: "notes", href: "/dm/story/notes", label: "Notes" },
  { id: "map", href: "/dm/story/map", label: "Map" },
] as const;

export type StoryTab = (typeof TABS)[number]["id"];

/** The Story section's sub-nav. Later views (plot threads, timeline, secrets) add a tab here. */
export function StoryNav({ active }: { active: StoryTab }) {
  return (
    <nav aria-label="Story" className="flex gap-1 border-b border-border">
      {TABS.map((tab) => (
        <PortalLink
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab.id === active ? "border-accent text-text" : "border-transparent text-muted hover:text-text"}`}
        >
          {tab.label}
        </PortalLink>
      ))}
    </nav>
  );
}
