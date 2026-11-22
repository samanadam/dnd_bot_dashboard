// Builds the public character vault (/vault/auren) from an Obsidian vault.
//   node scripts/build-vault.mjs [rootDir]
// rootDir holds "Auren Solvane/" (the vault) and "dm/" (the DM hand-off). Output is
// committed: lib/vault/auren.json plus resized WebP in public/vault/img, so deploys
// never need the vault. The page is public: only notes listed here ever leave it.
import { mkdir, readdir, readFile, rm, writeFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.argv[2] ?? "D:/dnd/solvaine";
const VAULT = path.join(ROOT, "Auren Solvane");
const DM_DIR = path.join(ROOT, "dm");
// English is the vault itself; Turkish is a translated copy in ROOT/tr (same file names,
// so note ids match; the first "# heading" of each file is its Turkish title).
const LANGS = [
  { code: "en", vault: VAULT, dm: DM_DIR, out: "lib/vault/auren.json", dmDocs: [["DM Summary.md", "Summary"], ["Cast Art.md", "Cast art"]] },
  { code: "tr", vault: path.join(ROOT, "tr", "Auren Solvane"), dm: path.join(ROOT, "tr", "dm"), out: "lib/vault/auren.tr.json", dmDocs: [["DM Summary.md", "Özet"], ["Cast Art.md", "Karakter görselleri"]], translated: true },
];
const OUT_IMG = "public/vault/img";
const HUB = "auren-solvane";
// Folders never scanned (DM goes in as the summary button only); notes dropped by title.
const SKIP_DIRS = new Set([".obsidian", "Assets", "DM", "Sessions", ".git"]);
const EXCLUDED_TITLES = new Set(["Gaps", "Character Bible v4"]);

export const slug = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function walk(dir, rel = "") {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) out.push(...(await walk(path.join(dir, e.name), `${rel}${e.name}/`)));
    } else if (e.name.endsWith(".md")) out.push(`${rel}${e.name}`);
  }
  return out;
}

function frontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const v = kv[2].trim();
    meta[kv[1]] = v.startsWith("[") ? v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean) : v.replace(/^"|"$/g, "");
  }
  return { meta, body: raw.slice(m[0].length) };
}

const imageNames = new Set(); // every image referenced by a kept note

// Turkish alt text from the image file name (the English page keeps the plain name).
const TR_NAME = { auren: "Auren", beyi: "Beyi", nehan: "Nehan", kaelen: "Kaelen", vexara: "Vexara", mirelle: "Mirelle", thoradin: "Thoradin", nerys: "Nerys", elarion: "Elarion", thalen: "Thalen", thelen: "Thelen", valen: "Valen" };
const TR_HOUSE = { solvane: "Solvane", aethravel: "Aethravel", letharion: "Letharion", caldrith: "Caldrith" };
const TR_VIEW = { portrait: "portre", full: "tam boy", "full-body": "tam boy", "full-sword": "tam boy, kılıçla", "full-psi": "tam boy, psi gücüyle" };
function trAlt(file) {
  const base = file.replace(/\.\w+$/, "");
  if (base === "family-ring") return "Aile Yüzüğü";
  if (base === "family-spellbook") return "Aile Büyü Kitabı";
  const house = base.match(/^house-(\w+)-emblem$/);
  if (house) return `${TR_HOUSE[house[1]]} Hanesi arması`;
  const [name, ...view] = base.split("-");
  const v = TR_VIEW[view.join("-")];
  return TR_NAME[name] && v ? `${TR_NAME[name]}, ${v}` : base;
}

function makeInline(ids, titleOf) {
  const re =
    /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|!\[([^\]]*)\]\(([^)]+)\)|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const inline = (text, links) => {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > last) out.push(text.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[1] || m[4]) {
        const file = path.basename((m[1] ?? m[4]).trim());
        imageNames.add(file);
        const w = Number(m[2]) || undefined;
        out.push({ k: "img", src: file, ...(w && { w }), alt: titleOf ? trAlt(file) : (m[3] ?? file.replace(/\.\w+$/, "")) });
      } else if (m[5]) {
        const id = slug(m[5].trim());
        const label = (m[6] ?? titleOf?.get(id) ?? m[5]).trim();
        if (ids.has(id)) {
          links?.add(id);
          out.push({ k: "l", id, c: label });
        } else out.push(label);
      } else if (m[7]) out.push({ k: "b", c: inline(m[7], links) });
      else if (m[8]) out.push({ k: "i", c: inline(m[8], links) });
      else if (m[9]) out.push({ k: "c", c: [m[9]] });
      else out.push({ k: "a", href: m[11], c: [m[10]] });
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  };
  return inline;
}

const hasExcludedLink = (text, ids) => [...text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].some((m) => !ids.has(slug(m[1].trim())) && isDropTarget(m[1].trim()));
const dropTargets = new Set([...EXCLUDED_TITLES, "DM Summary", "Cast Art"].map(slug));
const isDropTarget = (t) => dropTargets.has(slug(t));

function parseBody(body, ids, links, dropH1, titleOf) {
  const inline = makeInline(ids, titleOf);
  // "(see [[Gaps]])" style asides leave nothing behind once Gaps is hidden.
  let text = body
    .replace(/\s*\((?:see\s+)?\[\[([^\]|]+)\]\]\)/gi, (m, t) => (isDropTarget(t) ? "" : m))
    .replace(/\s*\bSee \[\[([^\]|]+)\]\]\.?/g, (m, t) => (isDropTarget(t) ? "" : m));
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", c: inline(para.join(" "), links) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const code = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      blocks.push({ t: "code", c: code.join("\n") });
    } else if (!line.trim()) flush();
    else if (/^#{1,6}\s/.test(line)) {
      flush();
      const [, hashes, rest] = line.match(/^(#+)\s+(.*)$/);
      if (hashes.length === 1 && dropH1) continue;
      blocks.push({ t: "h", l: hashes.length, c: inline(rest.trim(), links) });
    } else if (/^-{3,}\s*$/.test(line)) {
      flush();
      blocks.push({ t: "hr" });
    } else if (/^\|/.test(line)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = (r) => r.replace(/^\||\|\s*$/g, "").split("|").map((c) => c.trim());
      const [head, , ...rest] = rows;
      blocks.push({ t: "table", head: cells(head).map((c) => inline(c, links)), rows: rest.map((r) => cells(r).map((c) => inline(c, links))) });
    } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      flush();
      const items = [];
      const ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) {
        const raw = lines[i];
        const [, indent, , rest] = raw.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        i++;
        if (hasExcludedLink(rest, ids)) continue;
        const check = rest.match(/^\[([ xX])\]\s+(.*)$/);
        const item = { c: inline(check ? check[2] : rest, links), ...(check && { done: check[1] !== " " }) };
        if (indent.length >= 2 && items.length) (items.at(-1).kids ??= []).push(item);
        else items.push(item);
      }
      i--;
      if (items.length) blocks.push({ t: "list", ordered, items });
    } else if (/^>\s?/.test(line)) {
      flush();
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
      i--;
      blocks.push({ t: "q", c: inline(q.join(" "), links) });
    } else para.push(line.trim());
  }
  flush();
  // Headings left with nothing under them (their only content was hidden notes) go.
  return blocks.filter((b, idx) => !(b.t === "h" && (!blocks[idx + 1] || blocks[idx + 1].t === "h")));
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readLang({ vault, dm: dmDir, dmDocs, translated }) {
  const files = (await walk(vault)).filter((f) => !EXCLUDED_TITLES.has(path.basename(f, ".md")));
  const raws = await Promise.all(files.map((f) => readFile(path.join(vault, f), "utf8")));
  const names = files.map((f) => path.basename(f, ".md"));
  const ids = new Set(names.map(slug));
  const titles = translated ? raws.map((r, n) => frontmatter(r).body.match(/^# (.+)$/m)?.[1].trim() ?? names[n]) : names;
  const titleOf = translated ? new Map(names.map((nm, n) => [slug(nm), titles[n]])) : undefined;

  const notes = files.map((f, n) => {
    const { meta, body } = frontmatter(raws[n]);
    const title = titles[n];
    const id = slug(names[n]);
    const links = new Set();
    const blocks = parseBody(body, ids, links, true, titleOf);
    links.delete(id);
    const folder = f.includes("/") ? f.split("/")[0].toLowerCase() : "hub";
    const firstImg = JSON.stringify(blocks).match(/"k":"img","src":"([^"]+)"/)?.[1];
    return {
      id,
      title,
      group: folder,
      ...(meta.house && { house: meta.house }),
      tags: Array.isArray(meta.tags) ? meta.tags.filter((t) => t !== "dnd") : [],
      ...(firstImg && { thumb: firstImg }),
      links: [...links],
      blocks,
    };
  });
  const hub = notes.find((n) => n.id === HUB);
  if (!hub) throw new Error(`hub note ${HUB} missing`);
  hub.thumb ??= "auren-portrait.png";
  // A group note, not one person: a single member's face would mislabel it.
  delete notes.find((n) => n.id === "golden-generation")?.thumb;
  imageNames.add(hub.thumb);

  const dm = [];
  for (const [file, label] of dmDocs) {
    const { body } = frontmatter(await readFile(path.join(dmDir, file), "utf8"));
    // Same ids in every language, so the open tab survives a language switch.
    dm.push({ id: file.startsWith("DM") ? "summary" : "cast-art", title: label, blocks: parseBody(body, ids, new Set(), false, titleOf) });
  }
  return { notes, dm };
}

async function main() {
  const built = [];
  for (const lang of LANGS) built.push({ lang, ...(await readLang(lang)) });
  const notes = built.flatMap((b) => b.notes);

  // Images: Assets first, then the DM folder's copies. Full size + a square thumb.
  await rm(OUT_IMG, { recursive: true, force: true });
  await mkdir(OUT_IMG, { recursive: true });
  const thumbs = new Set(notes.map((n) => n.thumb).filter(Boolean));
  for (const name of imageNames) {
    const src = [path.join(VAULT, "Assets", name), path.join(DM_DIR, "Images", name)];
    const found = (await Promise.all(src.map(exists))).findIndex(Boolean);
    if (found < 0) throw new Error(`image not found: ${name}`);
    const base = name.replace(/\.\w+$/, "");
    const img = sharp(src[found]);
    await img.clone().resize({ width: 900, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(OUT_IMG, `${base}.webp`));
    if (thumbs.has(name)) await img.clone().resize(192, 192, { fit: "cover", position: "top" }).webp({ quality: 80 }).toFile(path.join(OUT_IMG, `${base}.thumb.webp`));
  }

  // Swap file names for the served base names, so the client never sees extensions.
  const bare = (s) => s.replace(/\.\w+$/, "");
  const fix = (v) => {
    if (Array.isArray(v)) return v.map(fix);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "src" || k === "thumb" ? bare(x) : fix(x)]));
    return v;
  };
  for (const { lang, notes: n, dm } of built) {
    await mkdir(path.dirname(lang.out), { recursive: true });
    await writeFile(lang.out, `${JSON.stringify({ hub: HUB, notes: fix(n), dm: fix(dm) })}
`);
    console.log(`vault ${lang.code}: ${n.length} notes, ${dm.length} dm docs`);
  }
  console.log(`${imageNames.size} images`);
}

await main();
