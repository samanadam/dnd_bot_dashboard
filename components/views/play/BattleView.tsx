"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, ChevronLeft, Dices, Heart, Lock, NotebookPen, Skull, StickyNote, Swords, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PortalLink } from "@/components/PortalLink";
import { useToast } from "@/components/Providers";
import { Badge, Button, EmptyState, Notice, inputBaseClass } from "@/components/ui";
import type { BattleNote, HealthBand, PlayerBattleEntry, PlayerBattleView } from "@/lib/combat/battleView";
import { inDemo } from "@/lib/demo/base";
import { DmError } from "@/lib/dm/client";
import { combat, fetchBattle, sheets } from "@/lib/sheets/client";

const BAND_TEXT: Record<HealthBand, string> = { max: "Healthy", mid: "Hurt", low: "Badly hurt", down: "Down" };

function Band({ band }: { band: HealthBand }) {
  if (band === "down")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-danger" title="Down">
        <Skull className="size-4" aria-hidden />
        <span className="sr-only">Down</span>
      </span>
    );
  const filled = band === "max" ? 3 : band === "mid" ? 2 : 1;
  const tone = band === "max" ? "bg-ok" : band === "mid" ? "bg-warn" : "bg-danger";
  return (
    <span className="inline-flex items-center gap-1" title={BAND_TEXT[band]} aria-label={BAND_TEXT[band]}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`size-2.5 rounded-full ${i < filled ? tone : "bg-surface-3"}`} aria-hidden />
      ))}
    </span>
  );
}

function NoteForm({ battleId, entry, onDone }: { battleId: string; entry: PlayerBattleEntry; onDone: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<"private" | "party">("private");
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          await combat.addNote(battleId, { combatantId: entry.key, text: text.trim(), visibility, keep });
          setText("");
          onDone();
        } catch (error) {
          toast("danger", error instanceof DmError ? error.message : "Could not save the note.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <textarea className={`${inputBaseClass} w-full py-2 text-sm`} rows={2} maxLength={2000} placeholder={`A note on ${entry.label}`} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div role="radiogroup" aria-label="Who sees it" className="flex gap-1 rounded-lg border border-border p-0.5">
          {(["private", "party"] as const).map((option) => (
            <button key={option} type="button" role="radio" aria-checked={visibility === option} onClick={() => setVisibility(option)} className={`rounded-md px-2 py-1 ${visibility === option ? "bg-surface-3 text-text" : "text-muted"}`}>
              {option === "private" ? "Only me (and the DM)" : "The party"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-muted">
          <input type="checkbox" className="accent-[var(--accent)]" checked={keep} onChange={(event) => setKeep(event.target.checked)} />
          Keep after the fight
        </label>
        <Button type="submit" size="sm" variant="primary" busy={busy} disabled={!text.trim()} className="ml-auto">
          Save note
        </Button>
      </div>
    </form>
  );
}

function NoteList({ notes, onChanged }: { notes: BattleNote[]; onChanged: () => void }) {
  const toast = useToast();
  return (
    <ul className="space-y-1.5">
      {notes.map((note) => (
        <li key={note.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 text-xs text-muted">
            {note.visibility === "private" ? <Lock className="size-3" aria-label="Private" /> : <Users className="size-3" aria-label="Party" />}
            <span>{note.mine ? "You" : note.author}</span>
            {note.keep ? <Badge tone="ok">Kept</Badge> : null}
            {note.mine ? (
              <button
                type="button"
                className="ml-auto rounded p-0.5 hover:text-danger"
                aria-label="Delete note"
                onClick={async () => {
                  try {
                    await combat.deleteNote(note.id);
                    onChanged();
                  } catch (error) {
                    toast("danger", error instanceof DmError ? error.message : "Could not delete.");
                  }
                }}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap">{note.text}</p>
        </li>
      ))}
    </ul>
  );
}

function Battle({ battleId, campaignId }: { battleId: string; campaignId: string }) {
  const toast = useToast();
  const [view, setView] = useState<PlayerBattleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const etag = useRef<string | null>(null);
  // undefined until the first view arrives: opening the page on your turn does not buzz.
  const lastTurn = useRef<string | null | undefined>(undefined);

  const refresh = async () => {
    try {
      const answer = await fetchBattle(battleId, etag.current);
      if (answer) {
        etag.current = answer.etag;
        setView(answer.view);
        setError(null);
      }
    } catch (caught) {
      setError(caught instanceof DmError ? caught.message : "The battle is not available.");
    }
  };

  useEffect(() => {
    let stopped = false;
    let handle: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      await refresh();
      handle = setTimeout(() => void tick(), document.visibilityState === "visible" ? 2000 : 15_000);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(handle);
    };
  }, [battleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A short buzz when it becomes the player's turn, on phones that allow it.
  const myTurn = view?.me && view.turn && "key" in view.turn && view.turn.key === view.me.key;
  useEffect(() => {
    const key = view?.turn && "key" in view.turn ? `${view.round}:${view.turn.key}` : null;
    if (!view) return;
    if (myTurn && key && lastTurn.current !== undefined && key !== lastTurn.current) navigator.vibrate?.(200);
    lastTurn.current = key;
  }, [myTurn, view, view?.round, view?.turn]);

  if (error && !view) return <Notice tone="danger">{error}</Notice>;
  if (!view) return <p className="text-sm text-muted">Loading the battle…</p>;

  const turnKey = view.turn && "key" in view.turn ? view.turn.key : null;
  const turnLabel = view.turn === null ? "Not started" : "hidden" in view.turn ? "Someone else's turn" : myTurn ? "Your turn!" : `${view.entries.find((e) => e.key === turnKey)?.label ?? "Someone"}'s turn`;
  const value = Math.max(0, Math.min(10_000, Math.trunc(Number(amount)) || 0));
  const me = view.me;

  const change = async (op: "damage" | "heal") => {
    if (!me || !value) return;
    try {
      await sheets.ops(me.characterId, [{ op, amount: value }]);
      setAmount("");
      await refresh();
    } catch (caught) {
      toast("danger", caught instanceof DmError ? caught.message : "That change did not go through.");
    }
  };

  return (
    <div className="space-y-4">
      <header className={`rounded-3xl border p-4 shadow-card ${myTurn ? "border-accent bg-accent-soft/40" : "border-border bg-surface"}`}>
        <p className="text-xs uppercase text-muted">{view.round > 0 ? `Round ${view.round}` : "Getting ready"}</p>
        <h1 className="text-xl font-semibold">{view.name}</h1>
        <p className={`text-sm ${myTurn ? "font-semibold text-accent" : "text-muted"}`} aria-live="polite">
          {turnLabel}
        </p>
      </header>

      {me ? (
        <section className="space-y-3 rounded-3xl border border-border bg-surface p-4 shadow-card" aria-label="Your character">
          <div className="flex flex-wrap items-center gap-3">
            <Heart className="size-4 text-danger" aria-hidden />
            <span className="text-2xl font-semibold tabular-nums">{me.hp}</span>
            <span className="text-muted">/ {me.maxHp}</span>
            {me.tempHp ? <Badge tone="accent">+{me.tempHp} temp</Badge> : null}
            {me.concentration ? (
              <Badge tone="accent">
                <Brain className="size-3" aria-hidden /> {me.concentration}
              </Badge>
            ) : null}
            {me.conditions.map((c) => (
              <Badge key={c} tone="warn">
                {c}
              </Badge>
            ))}
            <PortalLink href={`/play/c/${campaignId}/sheets/${me.characterId}`} className="ml-auto text-sm text-accent hover:underline">
              Full sheet
            </PortalLink>
          </div>
          {me.hp === 0 ? (
            <p className="text-sm text-danger">
              Down · saves {me.deathSaves.successes}/3 · failures {me.deathSaves.failures}/3
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <input aria-label="Amount" inputMode="numeric" className={`${inputBaseClass} h-10 w-20 text-center`} placeholder="0" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, "").slice(0, 5))} />
            <Button variant="danger" size="sm" disabled={!value} onClick={() => void change("damage")}>
              Took damage
            </Button>
            <Button size="sm" disabled={!value} onClick={() => void change("heal")}>
              Healed
            </Button>
            {me.needsInitiative ? (
              <Button
                size="sm"
                variant="primary"
                icon={Dices}
                className="ml-auto"
                onClick={async () => {
                  try {
                    const roll = await combat.rollInitiative(view.id, "normal");
                    toast("ok", `Initiative ${roll.total} (${roll.breakdown}). The DM will put it in.`);
                  } catch (caught) {
                    toast("danger", caught instanceof DmError ? caught.message : "Could not roll.");
                  }
                }}
              >
                Roll initiative
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <ol className="space-y-2" aria-label="Initiative order">
        {view.entries.map((entry) => {
          const notes = view.notes.filter((n) => n.targetKey === entry.key);
          const expanded = open === entry.key;
          return (
            <li key={entry.key} className={`rounded-2xl border bg-surface shadow-card ${entry.key === turnKey ? "border-accent" : "border-border"}`}>
              <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : entry.key)}>
                {entry.portrait && !inDemo() ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a small private image behind the login
                  <img src={`/api/sheets/${entry.portrait}/portrait?battle=${view.id}`} alt="" className="size-8 rounded-lg object-cover" />
                ) : (
                  <span className={`grid size-8 place-items-center rounded-lg ${entry.side === "party" ? "bg-accent-soft text-accent" : "bg-danger/10 text-danger"}`} aria-hidden>
                    {entry.side === "party" ? <Users className="size-4" /> : <Swords className="size-4" />}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {entry.label}
                    {entry.you ? <span className="ml-2 text-xs text-accent">you</span> : null}
                  </span>
                  {entry.conditions.length ? <span className="block truncate text-xs text-warn">{entry.conditions.join(", ")}</span> : null}
                </span>
                {entry.initiative !== null ? <span className="text-xs tabular-nums text-muted">init {entry.initiative}</span> : null}
                <Band band={entry.band} />
                {notes.length ? (
                  <span className="inline-flex items-center gap-0.5 text-xs text-muted">
                    <StickyNote className="size-3.5" aria-hidden />
                    {notes.length}
                  </span>
                ) : null}
              </button>
              {expanded ? (
                <div className="space-y-2 border-t border-border px-3 py-3">
                  <NoteList notes={notes} onChanged={() => void refresh()} />
                  <NoteForm battleId={view.id} entry={entry} onDone={() => void refresh()} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A campaign's battle page: waits for the DM to show one, then follows it. */
export function BattleView({ campaign }: { campaign: { id: string; name: string } }) {
  const battles = useQuery({ queryKey: ["battles", campaign.id], queryFn: () => combat.battles(campaign.id), refetchInterval: 10_000 });
  const [picked, setPicked] = useState<string | null>(null);
  const list = battles.data ?? [];
  const current = list.find((b) => b.id === picked) ?? list[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <PortalLink href={`/play/c/${campaign.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <ChevronLeft className="size-4" aria-hidden /> {campaign.name}
        </PortalLink>
        <PortalLink href={`/play/c/${campaign.id}/notes`} className="ml-auto inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <NotebookPen className="size-4" aria-hidden /> Kept notes
        </PortalLink>
      </div>
      {list.length > 1 ? (
        <select aria-label="Which battle" className={`${inputBaseClass} h-10`} value={current?.id ?? ""} onChange={(event) => setPicked(event.target.value)}>
          {list.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      ) : null}
      {battles.isError ? <Notice tone="danger">The battle list is unavailable.</Notice> : null}
      {current ? (
        <Battle key={current.id} battleId={current.id} campaignId={campaign.id} />
      ) : battles.isPending ? (
        <p className="text-sm text-muted">Looking for a battle…</p>
      ) : (
        <div className="rounded-3xl border border-dashed border-border py-8">
          <EmptyState icon={Swords} title="No battle right now">
            When the DM starts one and shows it to the party, it appears here by itself.
          </EmptyState>
        </div>
      )}
    </div>
  );
}

/** Notes players kept after their fights, grouped by battle. */
export function KeptNotesView({ campaign }: { campaign: { id: string; name: string } }) {
  const client = useQueryClient();
  const notes = useQuery({ queryKey: ["kept-notes", campaign.id], queryFn: () => combat.keptNotes(campaign.id) });
  const groups = new Map<string, NonNullable<typeof notes.data>>();
  for (const note of notes.data ?? []) groups.set(note.encounterName, [...(groups.get(note.encounterName) ?? []), note]);
  return (
    <div className="space-y-4">
      <PortalLink href={`/play/c/${campaign.id}/battle`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" aria-hidden /> Battle
      </PortalLink>
      <h1 className="text-2xl font-semibold">Kept notes</h1>
      {notes.data && notes.data.length === 0 ? <p className="text-sm text-muted">Notes you mark &ldquo;Keep after the fight&rdquo; collect here.</p> : null}
      {[...groups.entries()].map(([battle, items]) => (
        <section key={battle} className="space-y-2 rounded-3xl border border-border bg-surface p-4 shadow-card">
          <h2 className="font-medium">{battle}</h2>
          {[...new Set(items.map((n) => n.targetLabel))].map((label) => (
            <div key={label}>
              <h3 className="text-xs font-semibold uppercase text-muted">{label}</h3>
              <NoteList notes={items.filter((n) => n.targetLabel === label)} onChanged={() => void client.invalidateQueries({ queryKey: ["kept-notes", campaign.id] })} />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
