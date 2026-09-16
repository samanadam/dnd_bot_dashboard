"use client";

import { Clock, Fingerprint, MonitorSmartphone, Palette, Server, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import { useHealth, useStats } from "@/lib/bot/useBotState";
import type { ThemeId } from "@/lib/theme";
import { useLocalValue } from "@/lib/useLocalValue";
import { formatUptime } from "@/lib/format";
import { PresenceDot } from "../bot/LivePresence";
import { useToast } from "../Providers";
import { Button, Card, Field, inputClass, PageHeader } from "../ui";
import { ThemePicker } from "./ThemePicker";

type Props = {
  theme: ThemeId;
  user: { id: string; name: string | null; image: string | null };
  expires: string | null;
  signOut: ReactNode;
};

const SNOWFLAKE = /^\d{17,20}$/;

const noop = () => () => {};

// Dates are formatted in the viewer's locale, which the server cannot know, so
// render them only after hydration.
function LocalDate({ iso }: { iso: string | null }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!iso || !mounted) return <>—</>;
  return <>{new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export function SettingsView({ theme, user, expires, signOut }: Props) {
  const toast = useToast();
  const health = useHealth();
  const stats = useStats();
  const [voice, setVoice] = useLocalValue("portal.bot.voiceChannelId");
  const [text, setText] = useLocalValue("portal.bot.textChannelId");

  const voiceValid = voice === "" || SNOWFLAKE.test(voice.trim());
  const textValid = text === "" || SNOWFLAKE.test(text.trim());
  // Show only the tail of the Discord id: enough to recognise, not to copy around.
  const maskedId = user.id ? `••••${user.id.slice(-4)}` : "—";

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Appearance, this device, and your account." />

      <Card title="Appearance" subtitle="Pick a theme. It applies instantly and is remembered on this browser." icon={Palette}>
        <ThemePicker initial={theme} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="This device" subtitle="Defaults remembered only in this browser" icon={MonitorSmartphone}>
          <div className="space-y-4">
            <Field label="Default voice channel id" hint="Used to start recordings and join voice when the bot is not already in a channel.">
              <input
                className={inputClass}
                inputMode="numeric"
                autoComplete="off"
                placeholder="123456789012345678"
                value={voice}
                aria-invalid={!voiceValid}
                onChange={(event) => setVoice(event.target.value)}
              />
            </Field>
            <Field label="Default transcript text channel id" hint="Optional. Where the transcript is posted.">
              <input
                className={inputClass}
                inputMode="numeric"
                autoComplete="off"
                value={text}
                aria-invalid={!textValid}
                onChange={(event) => setText(event.target.value)}
              />
            </Field>
            <Button
              variant="danger-ghost"
              icon={Trash2}
              disabled={!voice && !text}
              onClick={() => {
                setVoice("");
                setText("");
                toast("ok", "Forgot the saved channel ids on this device.");
              }}
            >
              Forget saved channels
            </Button>
          </div>
        </Card>

        <Card title="Account" subtitle="Signed in with Discord" icon={UserRound}>
          <div className="flex items-center gap-4 rounded-2xl bg-surface-2 p-4">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- Discord CDN avatar, allowed by CSP
              <img src={user.image} alt="" className="size-12 rounded-full border border-border" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid size-12 place-items-center rounded-full bg-surface-3 text-lg font-semibold">
                {(user.name ?? "?").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{user.name ?? "Signed in"}</div>
              <div className="text-xs text-muted">Admin</div>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted">
              Sign out {signOut}
            </div>
          </div>
          <dl className="mt-2 divide-y divide-border">
            <Row label="Discord id">
              <span className="inline-flex items-center gap-1.5 font-mono">
                <Fingerprint className="size-3.5 text-muted" aria-hidden />
                {maskedId}
              </span>
            </Row>
            <Row label="Session ends">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5 text-muted" aria-hidden />
                <LocalDate iso={expires} />
              </span>
            </Row>
            <Row label="Access check">
              <span className="inline-flex items-center gap-1.5 text-ok">
                <ShieldCheck className="size-3.5" aria-hidden />
                Role re-checked every 5 minutes
              </span>
            </Row>
          </dl>
        </Card>
      </div>

      <Card title="Bot connection" subtitle="What the portal sees from the bot right now" icon={Server}>
        <dl className="grid gap-x-8 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
          <Row label="Status">
            <PresenceDot />
          </Row>
          <Row label="Version">{stats.data?.version ? `v${stats.data.version}` : "—"}</Row>
          <Row label="Uptime">{health.data ? formatUptime(health.data.uptime_seconds) : "—"}</Row>
          <Row label="Storage backend">{stats.data?.storage.backend ?? "—"}</Row>
        </dl>
        <p className="mt-3 text-xs text-muted">
          The bot address and token are kept on the server and are never sent to this browser, so they are not shown here.
        </p>
      </Card>
    </div>
  );
}
