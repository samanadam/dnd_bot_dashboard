"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Providers";
import { Button } from "@/components/ui";
import { dm, DmError } from "@/lib/dm/client";

export function DeleteCreatureButton({ id, name, kind }: { id: string; name: string; kind: "monster" | "npc" }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Button variant="danger-ghost" icon={Trash2} onClick={() => setOpen(true)}>
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        title={`Delete ${name}?`}
        confirmLabel="Delete"
        requireText="delete"
        busy={busy}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await dm.deleteCreature(id);
            toast("ok", `${name} deleted.`);
            router.push(kind === "npc" ? "/dm/npcs" : "/dm/bestiary?source=custom");
            router.refresh();
          } catch (error) {
            toast("danger", error instanceof DmError ? error.message : "Could not delete.");
            setBusy(false);
            setOpen(false);
          }
        }}
      >
        <p>The stat block and your notes are removed for good. Encounters that already include it keep their copy of the numbers.</p>
      </ConfirmDialog>
    </>
  );
}
