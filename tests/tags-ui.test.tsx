import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TagChips, TagFilter, TagInput } from "@/components/dm/Tags";

describe("tag chips", () => {
  it("shows the first few tags and counts the rest", () => {
    const html = renderToStaticMarkup(<TagChips tags={["Tavern", "Rain", "Night", "Calm"]} max={2} />);
    expect(html).toContain("Tavern");
    expect(html).toContain("Rain");
    expect(html).not.toContain("Night");
    expect(html).toContain("+2");
  });

  it("renders nothing for an untagged sound", () => {
    expect(renderToStaticMarkup(<TagChips tags={[]} />)).toBe("");
  });

  it("never turns a tag into markup", () => {
    const html = renderToStaticMarkup(<TagChips tags={['<img src=x onerror="alert(1)">']} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("tag filter", () => {
  const counts = [
    { tag: "Battle", count: 3 },
    { tag: "Tavern", count: 1 },
  ];

  it("lists each tag with how many sounds use it, and marks the selected ones", () => {
    const html = renderToStaticMarkup(<TagFilter counts={counts} selected={["tavern"]} onChange={() => undefined} />);
    expect(html).toContain("Battle");
    expect(html).toContain(">3<");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Tavern/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Battle/);
    expect(html).toContain("Clear");
  });

  it("offers no clear button when nothing is selected, and nothing at all when there are no tags", () => {
    expect(renderToStaticMarkup(<TagFilter counts={counts} selected={[]} onChange={() => undefined} />)).not.toContain("Clear");
    expect(renderToStaticMarkup(<TagFilter counts={[]} selected={[]} onChange={() => undefined} />)).toBe("");
  });
});

describe("tag input", () => {
  it("shows the tags it holds with a way to remove each", () => {
    const html = renderToStaticMarkup(<TagInput value={["Tavern", "Night"]} onChange={() => undefined} />);
    expect(html).toContain("Tavern");
    expect(html).toContain('aria-label="Remove tag Night"');
    expect(html).toContain('aria-label="Add a tag"');
  });

  it("suggests only tags the sound does not already have", () => {
    const html = renderToStaticMarkup(<TagInput value={["Tavern"]} onChange={() => undefined} suggestions={["tavern", "Battle"]} />);
    expect(html).toContain('value="Battle"');
    expect(html).not.toContain('value="tavern"');
  });
});
