import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StoryNav } from "@/components/dm/story/StoryNav";
import { countByType, filterNotes, makeResolver, missingTitles, parseTags } from "@/components/dm/story/helpers";
import { StoryNotesView, StoryOverviewView } from "@/components/views/dm/StoryViews";
import type { StorySummary } from "@/lib/dm/story";
import { tools } from "@/lib/tools/registry";

// Static rendering has no app router; the views only need these to exist.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, prefetch: () => undefined, back: () => undefined }),
  usePathname: () => "/dm/story",
  useSearchParams: () => new URLSearchParams(),
}));

const A = "aaaaaaaaaaaa";
const B = "bbbbbbbbbbbb";
const note = (id: string, title: string, over: Partial<StorySummary> = {}): StorySummary => ({
  id,
  title,
  type: "place",
  tags: [],
  campaignId: A,
  updatedAt: "2026-11-22T10:00:00.000Z",
  links: [],
  missing: [],
  ...over,
});

const render = (element: ReactElement) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{element}</QueryClientProvider>);

describe("story helpers", () => {
  it("turns a tag line into at most 12 trimmed, distinct tags of at most 32 characters", () => {
    expect(parseTags(" town, Inn ,, town, inn ")).toEqual(["town", "Inn"]);
    expect(parseTags("x".repeat(40))).toEqual(["x".repeat(32)]);
    expect(parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(","))).toHaveLength(12);
  });

  it("filters by text (title or tag), type and tag together", () => {
    const notes = [
      note("1", "Old Mill", { tags: ["ruin"] }),
      note("2", "Mill Pond", { type: "secret", tags: ["water"] }),
      note("3", "Baron", { type: "npc", tags: ["ruin", "noble"] }),
    ];
    expect(filterNotes(notes, { query: "mill", type: "all", tag: null }).map((n) => n.id)).toEqual(["1", "2"]);
    expect(filterNotes(notes, { query: "NOBLE", type: "all", tag: null }).map((n) => n.id)).toEqual(["3"]);
    expect(filterNotes(notes, { query: "", type: "secret", tag: null }).map((n) => n.id)).toEqual(["2"]);
    expect(filterNotes(notes, { query: "", type: "all", tag: "ruin" }).map((n) => n.id)).toEqual(["1", "3"]);
  });

  it("resolves titles only inside the same campaign, ignoring case", () => {
    const notes = [note("1", "Inn", { campaignId: A }), note("2", "Inn", { campaignId: B }), note("3", "Cave", { campaignId: B })];
    const resolve = makeResolver(notes, A);
    expect(resolve(" inn ")).toBe("1");
    expect(resolve("Cave")).toBeNull();
  });

  it("counts notes per type and lists missing titles by how often they are linked", () => {
    const notes = [
      note("1", "A", { missing: ["Ghost", "Lair"] }),
      note("2", "B", { type: "npc", missing: ["ghost"] }),
    ];
    expect(countByType(notes)).toMatchObject({ place: 1, npc: 1, secret: 0 });
    expect(missingTitles(notes).map(({ title, count }) => ({ title, count }))).toEqual([{ title: "Ghost", count: 2 }, { title: "Lair", count: 1 }]);
  });
});

describe("story pages", () => {
  it("marks the current tab in the sub-nav", () => {
    const html = renderToStaticMarkup(<StoryNav active="map" />);
    expect(html).toMatch(/href="\/dm\/story\/map"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/dm\/story\/map"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("offers the template only when there are no notes, and lists links that point nowhere", () => {
    expect(render(<StoryOverviewView notes={[]} />)).toContain("Start with a template");
    const html = render(<StoryOverviewView notes={[note("1", "Inn", { missing: ["Old Mill"] })]} />);
    expect(html).not.toContain("Start with a template");
    expect(html).toContain("Old Mill");
  });

  it("lists every note with a link to it", () => {
    const html = render(<StoryNotesView notes={[note("11111111-1111-4111-8111-111111111111", "Inn")]} />);
    expect(html).toContain("Inn");
    expect(html).toContain('href="/dm/story/notes/11111111-1111-4111-8111-111111111111"');
  });
});

describe("navigation", () => {
  it("lists Story among the DM Screen links", () => {
    const dm = tools.find((tool) => tool.id === "dm")!;
    expect(dm.links.map((link) => link.href)).toContain("/dm/story");
  });
});
