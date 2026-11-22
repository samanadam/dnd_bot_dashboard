import type { ReactNode } from "react";
import { PortalLink } from "@/components/PortalLink";
import { parseStory, type StoryInline } from "@/lib/dm/storyMarkdown";

// A story note's body, rendered as React elements only.

function Inlines({ nodes }: { nodes: StoryInline[] }): ReactNode {
  return nodes.map((n, i) => {
    if (typeof n === "string") return n;
    switch (n.k) {
      case "b":
        return <strong key={i}>{n.c}</strong>;
      case "i":
        return <em key={i}>{n.c}</em>;
      case "c":
        return <code key={i} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.85em]">{n.c}</code>;
      case "a":
        return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{n.c}</a>;
      case "link":
        return n.id ? (
          <PortalLink key={i} href={`/dm/story/notes/${n.id}`} className="text-accent underline underline-offset-2 hover:text-accent-strong">{n.title}</PortalLink>
        ) : (
          <PortalLink key={i} href={`/dm/story/notes/new?title=${encodeURIComponent(n.title)}`} title="No note with this title yet. Create it." className="text-warn underline decoration-dashed underline-offset-2">
            {n.title}
          </PortalLink>
        );
    }
  });
}

const heading = ["", "text-2xl", "text-xl", "text-lg"];

export function StoryBody({ body, resolve }: { body: string; resolve: (title: string) => string | null }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-text">
      {parseStory(body, resolve).map((b, i) => {
        switch (b.t) {
          case "h":
            return <h3 key={i} className={`font-display font-semibold ${heading[b.l]} mt-6 first:mt-0`}><Inlines nodes={b.c} /></h3>;
          case "p":
            return <p key={i}><Inlines nodes={b.c} /></p>;
          case "q":
            return <blockquote key={i} className="border-l-2 border-accent/60 pl-4 italic text-muted"><Inlines nodes={b.c} /></blockquote>;
          case "hr":
            return <hr key={i} className="border-border" />;
          case "code":
            return <pre key={i} className="overflow-x-auto rounded-lg bg-surface-3 p-3 font-mono text-xs">{b.c}</pre>;
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
              <Tag key={i} className={`space-y-1.5 pl-5 ${b.ordered ? "list-decimal" : "list-disc"}`}>
                {b.items.map((item, j) => <li key={j}><Inlines nodes={item} /></li>)}
              </Tag>
            );
          }
        }
      })}
    </div>
  );
}
