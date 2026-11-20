"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";
import { PlayerPicker } from "@/components/availability/PlayerPicker";
import { useToast } from "@/components/Providers";
import { Button, Card, Notice, PageHeader, Skeleton } from "@/components/ui";
import { availabilityApi } from "@/lib/availability/client";

const KEY = ["availability", "players"] as const;

export function AvailabilitySettingsView() {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: KEY, queryFn: availabilityApi.players });
  // Null until the owner edits; then their ticks win over the server's list.
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const selected = draft ?? new Set(query.data?.selected ?? []);

  const save = useMutation({
    mutationFn: () => availabilityApi.savePlayers([...selected]),
    onSuccess: () => {
      toast("ok", "Player list saved.");
      setDraft(null);
      return client.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast("danger", "Could not save the player list."),
  });
  const test = useMutation({
    mutationFn: availabilityApi.test,
    onSuccess: (result) =>
      result.sent
        ? toast("ok", "Test message sent. Check Telegram.")
        : toast("danger", result.reason === "not_configured" ? "Telegram is not set up (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)." : "Telegram did not accept the message."),
    onError: () => toast("danger", "Could not send the test message."),
  });

  const toggle = (userId: string) =>
    setDraft((current) => {
      const next = new Set(current ?? query.data?.selected ?? []);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });

  return (
    <div className="space-y-6">
      <PageHeader title="Availability" description="Who counts as everyone, and the Telegram message." />
      {query.isError ? <Notice>The settings could not be loaded.</Notice> : null}
      {query.data?.lastError ? (
        <Notice tone="warn" title="The last Telegram message failed">
          {query.data.lastError}. It is tried again at the next save.
        </Notice>
      ) : null}
      <Card title="Players" subtitle="Only these users are waited for. At least two are needed.">
        {query.isPending ? <Skeleton className="h-32 w-full" /> : null}
        {query.data ? <PlayerPicker view={query.data} selected={selected} onToggle={toggle} /> : null}
        <Button className="mt-4" variant="primary" busy={save.isPending} onClick={() => save.mutate()}>
          Save players
        </Button>
      </Card>
      <Card title="Telegram" subtitle="Sends you a message with a Share to WhatsApp button.">
        <Button icon={Send} busy={test.isPending} onClick={() => test.mutate()}>
          Send test message
        </Button>
      </Card>
    </div>
  );
}
