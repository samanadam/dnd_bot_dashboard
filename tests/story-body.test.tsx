import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoryBody } from "@/components/dm/story/StoryBody";
import { StoryGraph } from "@/components/dm/story/StoryGraph";

describe("StoryBody", () => {
  it("links a resolved title to its note and an unresolved one to the create page", () => {
    const html = renderToStaticMarkup(<StoryBody body="[[Inn]] and [[Old Mill]]" resolve={(t) => (t === "Inn" ? "abc" : null)} />);
    expect(html).toContain('href="/dm/story/notes/abc"');
    expect(html).toContain('href="/dm/story/notes/new?title=Old%20Mill"');
  });

  it("never renders hostile text as markup or a live link", () => {
    const html = renderToStaticMarkup(<StoryBody body={"<script>alert(1)</script> <img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))"} resolve={() => null} />);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript');
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("StoryGraph", () => {
  it("renders a labelled canvas and does not report a selection on its own", () => {
    const picked: (string | null)[] = [];
    const html = renderToStaticMarkup(
      <StoryGraph notes={[{ id: "a", title: "A", type: "place", links: ["b", "ghost"] }, { id: "b", title: "B", type: "npc", links: [] }]} selected={null} onSelect={(id) => picked.push(id)} />,
    );
    expect(html).toContain("<canvas");
    expect(html).toContain("aria-label=");
    expect(picked).toEqual([]);
  });
});
