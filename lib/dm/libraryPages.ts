import type { DatabaseSync } from "node:sqlite";

// The raw book pages behind imported monsters, kept so the converter can be run
// again after a fix without asking D&D Beyond for anything. Server database only.

export const MAX_LIBRARY_BYTES = 50 * 1024 * 1024;

export class LibraryPageRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  put(source: string, page: string, html: string): void {
    this.db
      .prepare(
        "INSERT INTO library_pages (source, page, html, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT (source, page) DO UPDATE SET html = excluded.html, fetched_at = excluded.fetched_at",
      )
      .run(source, page, html, this.now().toISOString());
  }

  removeSource(source: string): number {
    return Number(this.db.prepare("DELETE FROM library_pages WHERE source = ?").run(source).changes);
  }

  totalBytes(): number {
    const row = this.db.prepare("SELECT COALESCE(SUM(length(CAST(html AS BLOB))), 0) AS n FROM library_pages").get() as { n: number };
    return Number(row.n);
  }
}
