import { NOTE_TYPES, type NoteType, type StorySummary } from "@/lib/dm/story";

/** "town, Inn" → ["town", "Inn"]: trimmed, distinct (case-insensitive), at most 12 of 32 characters. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of text.split(",")) {
    const tag = part.trim().slice(0, 32);
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags.slice(0, 12);
}

export type NoteFilter = { query: string; type: NoteType | "all"; tag: string | null };

export function filterNotes(notes: StorySummary[], { query, type, tag }: NoteFilter): StorySummary[] {
  const needle = query.trim().toLowerCase();
  return notes.filter(
    (note) =>
      (type === "all" || note.type === type) &&
      (tag === null || note.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) &&
      (!needle || note.title.toLowerCase().includes(needle) || note.tags.some((t) => t.toLowerCase().includes(needle))),
  );
}

/** Title → note id for the notes of one campaign, ignoring case and outer spaces. */
export function makeResolver(notes: StorySummary[], campaignId: string | null): (title: string) => string | null {
  const byTitle = new Map(notes.filter((n) => n.campaignId === campaignId).map((n) => [n.title.trim().toLowerCase(), n.id]));
  return (title) => byTitle.get(title.trim().toLowerCase()) ?? null;
}

export function countByType(notes: StorySummary[]): Record<NoteType, number> {
  const counts = Object.fromEntries(NOTE_TYPES.map((type) => [type, 0])) as Record<NoteType, number>;
  for (const note of notes) counts[note.type]++;
  return counts;
}

/** Titles that notes link to but no note has, most linked first. */
export function missingTitles(notes: StorySummary[]): { title: string; count: number }[] {
  const found = new Map<string, { title: string; count: number }>();
  for (const note of notes) {
    for (const title of note.missing) {
      const entry = found.get(title.toLowerCase());
      if (entry) entry.count++;
      else found.set(title.toLowerCase(), { title, count: 1 });
    }
  }
  return [...found.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}

export const allTags = (notes: StorySummary[]): string[] =>
  [...new Set(notes.flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b));
