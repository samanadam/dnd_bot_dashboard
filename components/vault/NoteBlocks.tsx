import type { ReactNode } from "react";
import { imageUrl } from "@/lib/vault/base";
import type { Block, Inline, ListItem } from "@/lib/vault/types";

type Handlers = { onLink: (id: string) => void; onImage: (src: string, alt: string) => void; enlarge: (alt: string) => string };

const heading = "font-[family-name:var(--font-spectral)] font-semibold text-[#f1ecff]";

function Inlines({ nodes, h }: { nodes: Inline[]; h: Handlers }): ReactNode {
  return nodes.map((n, i) => {
    if (typeof n === "string") return n;
    switch (n.k) {
      case "b":
        return <strong key={i} className="font-semibold text-[#f4efff]"><Inlines nodes={n.c} h={h} /></strong>;
      case "i":
        return <em key={i}><Inlines nodes={n.c} h={h} /></em>;
      case "c":
        return <code key={i} className="rounded bg-white/8 px-1 py-0.5 font-mono text-[0.85em] text-[#cbb9ff]"><Inlines nodes={n.c} h={h} /></code>;
      case "l":
        return (
          <button key={i} type="button" onClick={() => h.onLink(n.id)}
            className="cursor-pointer rounded-sm text-[#a99bff] underline decoration-[#a99bff]/35 underline-offset-2 hover:text-[#d8cfff] hover:decoration-[#d8cfff] focus-visible:outline-2 focus-visible:outline-[#a99bff]">
            {n.c}
          </button>
        );
      case "a":
        return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-[#a99bff] underline underline-offset-2"><Inlines nodes={n.c} h={h} /></a>;
      case "img":
        return (
          <button key={i} type="button" onClick={() => h.onImage(n.src, n.alt)} aria-label={h.enlarge(n.alt)}
            className="my-1 inline-block max-w-full cursor-zoom-in align-top"
            style={{ width: n.w }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static vault art from /public, allowed by CSP */}
            <img src={imageUrl(n.src)} alt={n.alt} loading="lazy" className="h-auto w-full rounded-xl border border-white/10 shadow-lg shadow-black/40" />
          </button>
        );
    }
  });
}

const isImg = (n: Inline) => typeof n === "object" && n.k === "img";

function Items({ items, ordered, h }: { items: ListItem[]; ordered: boolean; h: Handlers }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`space-y-1.5 ${ordered ? "list-decimal pl-5" : "pl-0"}`}>
      {items.map((it, i) => (
        <li key={i} className={`${ordered ? "" : "relative list-none pl-5"} leading-relaxed`}>
          {!ordered && (
            it.done === undefined
              ? <span aria-hidden className="absolute left-1 top-[0.6em] size-1.5 rotate-45 bg-[#a99bff]/70" />
              : <span aria-hidden className={`absolute left-0 top-[0.3em] grid size-3.5 place-items-center rounded-sm border text-[10px] ${it.done ? "border-[#7fe3ad] bg-[#7fe3ad]/20 text-[#7fe3ad]" : "border-white/25"}`}>{it.done ? "✓" : ""}</span>
          )}
          {it.done !== undefined && <span className="sr-only">{it.done ? "Done: " : "Open: "}</span>}
          <Inlines nodes={it.c} h={h} />
          {it.kids && <div className="mt-1.5"><Items items={it.kids} ordered={false} h={h} /></div>}
        </li>
      ))}
    </Tag>
  );
}

export function NoteBlocks({ blocks, h }: { blocks: Block[]; h: Handlers }) {
  return (
    <div className="space-y-4 text-[15px] text-[#cfd3ea]">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h": {
            const size = b.l <= 1 ? "text-2xl" : b.l === 2 ? "text-xl" : "text-base";
            return <h3 key={i} className={`${heading} ${size} mt-6 border-b border-white/10 pb-1.5 first:mt-0`}><Inlines nodes={b.c} h={h} /></h3>;
          }
          case "p": {
            // A paragraph of only pictures (the vault's `![[a]] ![[b]]` rows) sits side by side.
            const pics = b.c.filter(isImg);
            if (pics.length && b.c.every((n) => isImg(n) || (typeof n === "string" && !n.trim()))) {
              return (
                <div key={i} className="flex items-start gap-2">
                  {pics.map((n, j) => n.k === "img" && (
                    <button key={j} type="button" onClick={() => h.onImage(n.src, n.alt)} aria-label={h.enlarge(n.alt)}
                      className="min-w-0 cursor-zoom-in" style={{ flex: `${n.w ?? 300} 1 0`, maxWidth: n.w }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- static vault art from /public, allowed by CSP */}
                      <img src={imageUrl(n.src)} alt={n.alt} loading="lazy" className="h-auto w-full rounded-xl border border-white/10 shadow-lg shadow-black/40" />
                    </button>
                  ))}
                </div>
              );
            }
            return <p key={i} className="leading-relaxed"><Inlines nodes={b.c} h={h} /></p>;
          }
          case "q":
            return <blockquote key={i} className="border-l-2 border-[#a99bff]/60 pl-4 italic text-[#b8bddb]"><Inlines nodes={b.c} h={h} /></blockquote>;
          case "hr":
            return <hr key={i} className="border-white/10" />;
          case "code":
            return <pre key={i} className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs">{b.c}</pre>;
          case "list":
            return <Items key={i} items={b.items} ordered={b.ordered} h={h} />;
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-max text-left text-sm">
                  <thead className="bg-white/5 text-xs uppercase tracking-wider text-[#9aa0c4]">
                    <tr>{b.head.map((c, j) => <th key={j} scope="col" className="px-3 py-2 font-medium"><Inlines nodes={c} h={h} /></th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-t border-white/8 align-top">
                        {r.map((c, k) => <td key={k} className="px-3 py-2"><Inlines nodes={c} h={h} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
