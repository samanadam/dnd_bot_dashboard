// A small Markdown subset for story notes: headings, paragraphs, lists, quotes,
// fences, rules, bold, italic, inline code, [[Title]] links and http(s) links.
// Everything else, raw HTML and other URL schemes included, stays literal text,
// and the result is plain data that React renders as elements, never as HTML.

export type StoryInline =
  | string
  | { k: "b" | "i" | "c"; c: string }
  | { k: "link"; title: string; id: string | null }
  | { k: "a"; href: string; c: string };

export type StoryBlock =
  | { t: "p" | "q"; c: StoryInline[] }
  | { t: "h"; l: 1 | 2 | 3; c: StoryInline[] }
  | { t: "list"; ordered: boolean; items: StoryInline[][] }
  | { t: "code"; c: string }
  | { t: "hr" };

const INLINE = /\[\[([^\[\]\n]+)\]\]|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|`([^`]+)`|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;
const ITEM = /^\s*([-*]|\d+\.)\s+(.*)$/;

function inline(text: string, resolve: (title: string) => string | null): StoryInline[] {
  const out: StoryInline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) out.push({ k: "link", title: m[1].trim(), id: resolve(m[1].trim()) });
    else if (m[2] !== undefined) out.push({ k: "b", c: m[2] });
    else if (m[3] !== undefined) out.push({ k: "i", c: m[3] });
    else if (m[4] !== undefined) out.push({ k: "c", c: m[4] });
    else out.push({ k: "a", href: m[6], c: m[5] });
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function parseStory(body: string, resolve: (title: string) => string | null): StoryBlock[] {
  const lines = body.split(/\r?\n/);
  const blocks: StoryBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", c: inline(para.join(" "), resolve) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      blocks.push({ t: "code", c: code.join("\n") });
    } else if (!line.trim()) flush();
    else if (/^#{1,6}\s/.test(line)) {
      flush();
      const [, hashes, rest] = line.match(/^(#+)\s+(.*)$/)!;
      blocks.push({ t: "h", l: Math.min(3, hashes.length) as 1 | 2 | 3, c: inline(rest.trim(), resolve) });
    } else if (/^-{3,}\s*$/.test(line)) {
      flush();
      blocks.push({ t: "hr" });
    } else if (ITEM.test(line)) {
      flush();
      const ordered = /^\s*\d+\./.test(line);
      const items: StoryInline[][] = [];
      while (i < lines.length && ITEM.test(lines[i])) items.push(inline(lines[i++].match(ITEM)![2], resolve));
      i--;
      blocks.push({ t: "list", ordered, items });
    } else if (/^>\s?/.test(line)) {
      flush();
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
      i--;
      blocks.push({ t: "q", c: inline(quote.join(" "), resolve) });
    } else para.push(line.trim());
  }
  flush();
  return blocks;
}
