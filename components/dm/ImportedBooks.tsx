"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { usePortalRouter } from "@/components/PortalLink";
import { useToast } from "@/components/Providers";
import { Button } from "@/components/ui";
import { dm, DmError } from "@/lib/dm/client";

export type ImportedBook = { source: string; label: string; count: number };

/** The books imported into the library, each with a way to take it out again. */
export function ImportedBooks({ books }: { books: ImportedBook[] }) {
  const router = usePortalRouter();
  const toast = useToast();
  const [target, setTarget] = useState<ImportedBook | null>(null);
  const [busy, setBusy] = useState(false);
  if (books.length === 0) return null;

  return (
    <section aria-label="Imported books" className="space-y-2 rounded-3xl border border-border bg-surface p-4 shadow-card">
      <h2 className="font-display text-lg font-semibold">Imported books</h2>
      <ul className="divide-y divide-border">
        {books.map((book) => (
          <li key={book.source} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">
              {book.label} <span className="tabular-nums text-faint">· {book.count.toLocaleString("en")} monsters</span>
            </span>
            <Button variant="danger-ghost" icon={Trash2} onClick={() => setTarget(book)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={target !== null}
        title={`Remove ${target?.label ?? "this book"}?`}
        confirmLabel="Remove"
        busy={busy}
        onClose={() => setTarget(null)}
        onConfirm={async () => {
          if (!target) return;
          setBusy(true);
          try {
            const { removed } = await dm.removeLibrarySource(target.source);
            toast("ok", `${removed} monsters removed.`);
            router.refresh();
          } catch (error) {
            toast("danger", error instanceof DmError ? error.message : "Could not remove the book.");
          } finally {
            setBusy(false);
            setTarget(null);
          }
        }}
      >
        <p>The imported monsters are removed and the bundled SRD versions show again. Encounters that already include one keep their copy of the numbers.</p>
      </ConfirmDialog>
    </section>
  );
}
