"use client";

import { ArrowDown, ArrowUp, ChevronLeft, Clock, Download, FileText, Languages, MessagesSquare, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { BotError } from "@/lib/bot/client";
import type { TranscriptSegment } from "@/lib/bot/types";
import { useTranscript, type Transcript } from "@/lib/bot/useBotState";
import { formatDateTime, formatDuration } from "@/lib/format";
import { Button, EmptyState, inputClass, Notice, Skeleton } from "../ui";

// Speaker identity colours, fixed order, mid lightness so they read on both
// themes. Text always stays in the text colour; only the marker is coloured.
const SPEAKER_COLOURS = ["#3b82c4", "#d97a2b", "#2f9e6e", "#c24f93", "#7c6bd6", "#b8931c", "#d04f4f", "#2a9bb0"];

function colourFor(speakers: string[], speaker: string) {
  const index = speakers.indexOf(speaker);
  return SPEAKER_COLOURS[(index < 0 ? 0 : index) % SPEAKER_COLOURS.length];
}

function safeFileName(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "transcript"
  );
}

export function renderMarkdown(transcript: Transcript) {
  const { session, segments } = transcript;
  const lines = [
    `# ${session.name ?? "Session"}`,
    "",
    `- Date: ${session.started_at}`,
    `- Duration: ${formatDuration(session.duration_seconds)}`,
    `- Speakers: ${session.speakers.join(", ") || "none"}`,
    `- Words: ${session.word_count}`,
    "",
    "## Transcript",
    "",
    ...segments.map((segment) => `[${segment.clock ?? "--:--:--"}] ${segment.speaker}: ${segment.text}`),
  ];
  return `${lines.join("\n")}\n`;
}

function download(transcript: Transcript, kind: "md" | "txt") {
  const body =
    kind === "md"
      ? renderMarkdown(transcript)
      : transcript.segments.map((s) => `[${s.clock ?? "--:--:--"}] ${s.speaker}: ${s.text}`).join("\n") + "\n";
  const blob = new Blob([body], { type: kind === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(transcript.session.name ?? transcript.session.id)}.${kind}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Highlight({ text, needle }: { text: string; needle: string }) {
  if (!needle) return <>{text}</>;
  const lower = text.toLocaleLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    parts.push(<Fragment key={`t${from}`}>{text.slice(from, at)}</Fragment>);
    parts.push(
      <mark key={`m${at}`} className="rounded bg-warn/30 px-0.5 text-text">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  parts.push(<Fragment key="end">{text.slice(from)}</Fragment>);
  return <>{parts}</>;
}

function Stat({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 text-faint" aria-hidden />
      {children}
    </span>
  );
}

export function TranscriptView({ sessionId }: { sessionId: string }) {
  const query = useTranscript(sessionId);
  const [search, setSearch] = useState("");
  const needle = useDeferredValue(search.trim().toLocaleLowerCase());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);

  const transcript = query.data;
  const speakers = useMemo(() => transcript?.session.speakers ?? [], [transcript]);

  const visible = useMemo(() => {
    if (!transcript) return [] as { segment: TranscriptSegment; index: number }[];
    return transcript.segments.map((segment, index) => ({ segment, index })).filter(({ segment }) => !hidden.has(segment.speaker));
  }, [transcript, hidden]);

  const matches = useMemo(
    () => (needle ? visible.filter(({ segment }) => segment.text.toLocaleLowerCase().includes(needle)).map(({ index }) => index) : []),
    [visible, needle],
  );

  const wordsBySpeaker = useMemo(() => {
    const counts = new Map<string, number>();
    for (const segment of transcript?.segments ?? []) {
      counts.set(segment.speaker, (counts.get(segment.speaker) ?? 0) + segment.text.split(/\s+/).filter(Boolean).length);
    }
    return counts;
  }, [transcript]);
  const totalWords = [...wordsBySpeaker.values()].reduce((sum, value) => sum + value, 0) || 1;

  useEffect(() => {
    if (!matches.length) return;
    const target = listRef.current?.querySelector<HTMLElement>(`[data-index="${matches[Math.min(cursor, matches.length - 1)]}"]`);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [cursor, matches]);

  const back = (
    <Link href="/bot/sessions" className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-text">
      <ChevronLeft className="size-4" aria-hidden /> Sessions
    </Link>
  );

  if (query.isPending) {
    return (
      <div className="space-y-6">
        {back}
        <Skeleton className="h-28" />
        <Skeleton className="h-12" />
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>
    );
  }

  if (query.isError || !transcript) {
    const missing = query.error instanceof BotError && query.error.code === "no_transcript";
    const unknown = query.error instanceof BotError && query.error.code === "not_found";
    return (
      <div className="space-y-6">
        {back}
        <div className="rounded-3xl border border-border bg-surface shadow-card">
          <EmptyState icon={FileText} title={missing ? "No transcript yet" : unknown ? "Session not found" : "Transcript unavailable"}>
            {missing
              ? "The transcriber has not sent this session back yet. It shows up here as soon as it does."
              : unknown
                ? "This session does not exist on the bot."
                : query.error instanceof BotError
                  ? query.error.message
                  : "Could not load the transcript."}
          </EmptyState>
        </div>
      </div>
    );
  }

  const { session } = transcript;
  const toggleSpeaker = (speaker: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(speaker)) next.delete(speaker);
      else next.add(speaker);
      return next;
    });
  const position = matches.length ? Math.min(cursor, matches.length - 1) : 0;

  return (
    <div className="space-y-6">
      {back}

      <header className="rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Transcript</p>
        <h1 className="mt-1 text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">{session.name ?? "Untitled session"}</h1>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
          <Stat icon={Clock}>
            {formatDateTime(session.started_at)} · {formatDuration(session.duration_seconds)}
          </Stat>
          <Stat icon={Users}>{session.speakers.length} speakers</Stat>
          <Stat icon={MessagesSquare}>{session.word_count.toLocaleString()} words</Stat>
          {session.language && <Stat icon={Languages}>{session.language.toUpperCase()}</Stat>}
        </div>

        {speakers.length > 0 && (
          <div className="mt-5">
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              {speakers.map((speaker) => (
                <span
                  key={speaker}
                  style={{ width: `${((wordsBySpeaker.get(speaker) ?? 0) / totalWords) * 100}%`, background: colourFor(speakers, speaker) }}
                  className="h-full border-r-2 border-surface last:border-r-0"
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Speakers">
              {speakers.map((speaker) => {
                const off = hidden.has(speaker);
                return (
                  <li key={speaker}>
                    <button
                      type="button"
                      onClick={() => toggleSpeaker(speaker)}
                      aria-pressed={!off}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        off ? "border-border text-faint line-through" : "border-border-strong bg-surface-2 text-text"
                      }`}
                    >
                      <span className="size-2.5 rounded-full" style={{ background: colourFor(speakers, speaker), opacity: off ? 0.35 : 1 }} aria-hidden />
                      {speaker}
                      <span className="tabular-nums text-muted">{Math.round(((wordsBySpeaker.get(speaker) ?? 0) / totalWords) * 100)}%</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </header>

      {session.warnings.length > 0 && (
        <Notice tone="warn" title="The transcriber reported problems">
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {session.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      )}
      {transcript.truncated && <Notice tone="warn">This transcript is very long; only the first part is shown. Download it for the rest.</Notice>}

      <div className="sticky top-[env(safe-area-inset-top,0px)] z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface/90 p-2 shadow-card backdrop-blur-xl">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            id="transcript-search"
            type="search"
            className={`${inputClass} h-10 pl-9`}
            placeholder="Search what was said"
            aria-label="Search the transcript"
            maxLength={100}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches.length) {
                event.preventDefault();
                setCursor((value) => (event.shiftKey ? (value - 1 + matches.length) % matches.length : (value + 1) % matches.length));
              }
            }}
          />
        </div>
        {needle && (
          <div className="flex items-center gap-1">
            <span className="min-w-16 text-center text-xs tabular-nums text-muted" role="status">
              {matches.length ? `${position + 1} / ${matches.length}` : "No matches"}
            </span>
            <Button size="icon" variant="ghost" aria-label="Previous match" disabled={!matches.length} onClick={() => setCursor((position - 1 + matches.length) % matches.length)}>
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Next match" disabled={!matches.length} onClick={() => setCursor((position + 1) % matches.length)}>
              <ArrowDown className="size-4" aria-hidden />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Clear search" onClick={() => setSearch("")}>
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        )}
        <div className="flex gap-1">
          <Button size="sm" icon={Download} onClick={() => download(transcript, "md")}>
            .md
          </Button>
          <Button size="sm" variant="ghost" onClick={() => download(transcript, "txt")}>
            .txt
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface shadow-card">
          <EmptyState icon={MessagesSquare} title={transcript.segments.length ? "Every speaker is hidden" : "No speech was detected"} />
        </div>
      ) : (
        <ol ref={listRef} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
          {visible.map(({ segment, index }, position_) => {
            const previous = visible[position_ - 1]?.segment;
            const continued = previous?.speaker === segment.speaker;
            const current = needle && matches[position] === index;
            return (
              <li
                key={index}
                data-index={index}
                className={`grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 px-4 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_3rem] sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:px-6 ${
                  continued ? "pb-2 pt-0" : "border-t border-border pb-2 pt-3 first:border-t-0"
                } ${current ? "bg-warn/10" : ""}`}
              >
                <span className="pt-0.5 font-mono text-xs tabular-nums text-faint">{segment.clock ?? ""}</span>
                <div className="min-w-0">
                  {!continued && (
                    <div className="mb-0.5 flex items-center gap-2 text-sm font-semibold">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: colourFor(speakers, segment.speaker) }} aria-hidden />
                      {segment.speaker}
                    </div>
                  )}
                  <p className="text-pretty text-[15px] leading-relaxed text-text">
                    <Highlight text={segment.text} needle={needle} />
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
