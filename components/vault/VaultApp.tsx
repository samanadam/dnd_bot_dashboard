"use client";

import { BookOpen, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { GROUP_COLOR, HOUSE_COLOR, imageUrl } from "@/lib/vault/base";
import { type Lang, PATH, T } from "@/lib/vault/i18n";
import type { VaultData } from "@/lib/vault/types";
import { NoteBlocks } from "./NoteBlocks";
import { VaultGraph } from "./VaultGraph";

const title = "font-[family-name:var(--font-spectral)]";

export function VaultApp({ data, lang }: { data: VaultData; lang: Lang }) {
  const { notes, hub, dm } = data;
  const t = T[lang];
  const other = lang === "en" ? "tr" : "en";
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const backlinks = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const n of notes) for (const t of n.links) m.set(t, [...(m.get(t) ?? []), n.id]);
    return m;
  }, [notes]);

  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dmOpen, setDmOpen] = useState(false);
  const [dmTab, setDmTab] = useState(dm[0]?.id ?? "");
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [wide, setWide] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const select = useCallback((id: string | null) => {
    setSelected(id && byId.has(id) ? id : null);
    history.replaceState(null, "", id ? `#${id}` : location.pathname);
  }, [byId]);

  // Deep links (#kaelen) so the DM can be sent straight to a note.
  useEffect(() => {
    const open = () => {
      const id = location.hash.slice(1);
      if (byId.has(id)) setSelected(id);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [byId]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (lightbox) setLightbox(null);
      else if (dmOpen) setDmOpen(false);
      else if (selected) select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, dmOpen, selected, select]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [selected]);

  const note = selected ? byId.get(selected) ?? null : null;
  const matches = query.trim() ? notes.filter((n) => n.title.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const handlers = { onLink: select, onImage: (src: string, alt: string) => setLightbox({ src, alt }), enlarge: t.enlarge };
  const doc = dm.find((d) => d.id === dmTab) ?? dm[0];
  const inset = useMemo(
    () => (note ? (wide ? { right: 460, bottom: 0 } : { right: 0, bottom: Math.round(window.innerHeight * 0.58) }) : { right: 0, bottom: 0 }),
    [note, wide],
  );

  const chip = (id: string) => (
    <button key={id} type="button" onClick={() => select(id)}
      className="cursor-pointer rounded-full border border-white/12 bg-white/5 px-3 py-1 text-sm text-[#d6d3f2] transition-colors hover:border-[#a99bff]/60 hover:bg-[#a99bff]/15 focus-visible:outline-2 focus-visible:outline-[#a99bff]">
      {byId.get(id)?.title}
    </button>
  );

  return (
    <main lang={lang} className="fixed inset-0 overflow-hidden bg-[#070813] text-[#e9e6fb]"
      style={{ backgroundImage: "radial-gradient(60% 50% at 20% 15%, rgb(112 92 255 / 0.20), transparent 70%), radial-gradient(50% 45% at 85% 85%, rgb(34 190 220 / 0.12), transparent 70%), radial-gradient(40% 40% at 70% 10%, rgb(238 111 143 / 0.08), transparent 70%)" }}>
      <VaultGraph label={t.canvas} notes={notes} hub={hub} selected={selected} query={query} inset={inset} onSelect={select} />

      <header className={`pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4 sm:p-6 ${note ? "md:pr-[484px]" : ""}`}>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[#a99bff]">{t.eyebrow}</p>
          <h1 className={`${title} text-2xl font-semibold text-[#f6f1ff] sm:text-3xl`}>Auren “Sunny” Solvane</h1>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8d93b8]" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.find}
              aria-label={t.find}
              className="h-10 w-40 rounded-full border border-white/12 bg-[#10122a]/80 pl-9 pr-3 text-sm text-[#eceafd] placeholder:text-[#7d83a8] backdrop-blur focus:border-[#a99bff]/70 focus:outline-none sm:w-56" />
            {matches.length > 0 && (
              <ul className="absolute right-0 mt-2 max-h-72 w-64 overflow-y-auto rounded-2xl border border-white/12 bg-[#0d0f24]/95 p-1.5 shadow-2xl backdrop-blur">
                {matches.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => { select(n.id); setQuery(""); }}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: GROUP_COLOR[n.group] }} />
                      {n.title}
                      <span className="ml-auto text-xs text-[#7d83a8]">{t.groups[n.group]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href={`${PATH[other]}${selected ? `#${selected}` : ""}`} lang={other} hrefLang={other}
            className="flex h-10 items-center rounded-full border border-white/12 bg-[#10122a]/80 px-4 text-sm text-[#d6d3f2] backdrop-blur hover:border-[#a99bff]/60 focus-visible:outline-2 focus-visible:outline-[#a99bff]">
            {t.switchTo}
          </Link>
          {doc && (
            <button type="button" onClick={() => setDmOpen(true)}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[#a99bff] px-4 text-sm font-semibold text-[#0d0a24] shadow-lg shadow-[#7b66ff]/30 transition-colors hover:bg-[#c3b8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <BookOpen aria-hidden className="size-4" /> {t.dm}
            </button>
          )}
        </div>
      </header>

      {!note && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
          <ul className="pointer-events-auto flex flex-wrap gap-x-4 gap-y-1.5 rounded-2xl border border-white/10 bg-[#0b0d20]/70 px-4 py-3 text-xs text-[#b9bddb] backdrop-blur">
            {Object.entries(t.groups).map(([g, label]) => (
              <li key={g} className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: GROUP_COLOR[g] }} />{label}
              </li>
            ))}
            {Object.entries(HOUSE_COLOR).map(([h, c]) => (
              <li key={h} className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-full border-2" style={{ borderColor: c }} />{t.house(h)}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[#7d83a8]">{t.hint}</p>
        </div>
      )}

      {note && (
        <aside aria-label={note.title} ref={panelRef}
          className="vault-rise absolute bottom-0 right-0 flex h-[58vh] w-full flex-col overflow-y-auto rounded-t-3xl border-t border-white/12 bg-[#0b0d22]/94 shadow-[0_-20px_60px_-20px_rgb(0_0_0/0.8)] backdrop-blur-xl md:top-0 md:h-auto md:w-[460px] md:rounded-none md:border-l md:border-t-0">
          <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-white/10 bg-[#0b0d22]/95 px-5 py-4 backdrop-blur">
            {note.thumb && (
              // eslint-disable-next-line @next/next/no-img-element -- static vault art from /public, allowed by CSP
              <img src={imageUrl(note.thumb, true)} alt="" className="size-12 shrink-0 rounded-full border-2 object-cover"
                style={{ borderColor: (note.house && HOUSE_COLOR[note.house]) || GROUP_COLOR[note.group] }} />
            )}
            <div className="min-w-0 flex-1">
              <h2 className={`${title} text-xl font-semibold leading-tight text-[#f6f1ff]`}>{note.title}</h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[#9aa0c4]">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: GROUP_COLOR[note.group] }} />{t.groups[note.group]}
                </span>
                {note.house && <span>· {t.house(note.house)}</span>}
              </p>
            </div>
            <button type="button" onClick={() => select(null)} aria-label={t.close}
              className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-[#b9bddb] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#a99bff]">
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="space-y-8 px-5 py-5">
            <NoteBlocks blocks={note.blocks} h={handlers} />
            {note.links.length > 0 && (
              <section aria-label={t.linked}>
                <h3 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[#8d93b8]">{t.linksTo}</h3>
                <div className="flex flex-wrap gap-2">{note.links.map(chip)}</div>
              </section>
            )}
            {(backlinks.get(note.id)?.length ?? 0) > 0 && (
              <section aria-label={t.backlinks}>
                <h3 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[#8d93b8]">{t.mentionedIn}</h3>
                <div className="flex flex-wrap gap-2">{backlinks.get(note.id)!.map(chip)}</div>
              </section>
            )}
          </div>
        </aside>
      )}

      {dmOpen && doc && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/65 p-3 backdrop-blur-sm sm:p-8" onClick={() => setDmOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t.dm} onClick={(e) => e.stopPropagation()}
            className="vault-rise flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#0b0d22] shadow-2xl">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <div role="tablist" className="flex gap-1">
                {dm.map((d) => (
                  <button key={d.id} role="tab" type="button" aria-selected={d.id === doc.id} onClick={() => setDmTab(d.id)}
                    className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[#a99bff] ${d.id === doc.id ? "bg-[#a99bff] text-[#0d0a24]" : "text-[#b9bddb] hover:bg-white/8"}`}>
                    {d.title}
                  </button>
                ))}
              </div>
              <button type="button" autoFocus onClick={() => setDmOpen(false)} aria-label={t.dmClose}
                className="ml-auto grid size-9 cursor-pointer place-items-center rounded-full text-[#b9bddb] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#a99bff]">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div role="tabpanel" className="overflow-y-auto px-5 py-6 sm:px-8">
              <NoteBlocks blocks={doc.blocks} h={handlers} />
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="absolute inset-0 z-30 grid cursor-zoom-out place-items-center bg-black/85 p-4" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label={lightbox.alt}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static vault art from /public, allowed by CSP */}
          <img src={imageUrl(lightbox.src)} alt={lightbox.alt} className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
        </div>
      )}
    </main>
  );
}
