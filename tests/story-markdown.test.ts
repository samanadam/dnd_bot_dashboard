import { describe, expect, it } from "vitest";
import { parseStory } from "@/lib/dm/storyMarkdown";

const none = () => null;

describe("parseStory", () => {
  it("parses headings, paragraphs, lists, quotes, fences and rules", () => {
    const blocks = parseStory("# Big\n## Mid\ntext line\nsecond line\n\n- a\n- b\n\n1. one\n2. two\n\n> quoted\n\n```\ncode here\n```\n\n---", none);
    expect(blocks).toEqual([
      { t: "h", l: 1, c: ["Big"] },
      { t: "h", l: 2, c: ["Mid"] },
      { t: "p", c: ["text line second line"] },
      { t: "list", ordered: false, items: [["a"], ["b"]] },
      { t: "list", ordered: true, items: [["one"], ["two"]] },
      { t: "q", c: ["quoted"] },
      { t: "code", c: "code here" },
      { t: "hr" },
    ]);
  });

  it("resolves [[Title]] to an id, or null when no note has it", () => {
    const resolve = (title: string) => (title.toLowerCase() === "inn" ? "inn-id" : null);
    expect(parseStory("go to [[Inn]] then [[ Ghost ]]", resolve)).toEqual([
      { t: "p", c: ["go to ", { k: "link", title: "Inn", id: "inn-id" }, " then ", { k: "link", title: "Ghost", id: null }] },
    ]);
  });

  it("reads bold, italic and inline code", () => {
    expect(parseStory("**b** and *i* and `c`", none)).toEqual([
      { t: "p", c: [{ k: "b", c: "b" }, " and ", { k: "i", c: "i" }, " and ", { k: "c", c: "c" }] },
    ]);
  });

  it("links only http(s) URLs; scripts, raw HTML and other schemes stay plain text", () => {
    const hostile = parseStory("<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n[ok](https://a.example/p?q=1)", none);
    expect(hostile[0]).toEqual({ t: "p", c: ["<script>alert(1)</script>"] });
    expect(hostile[1]).toEqual({ t: "p", c: ["[x](javascript:alert(1))"] });
    expect(hostile[2]).toEqual({ t: "p", c: [{ k: "a", href: "https://a.example/p?q=1", c: "ok" }] });
  });
});
