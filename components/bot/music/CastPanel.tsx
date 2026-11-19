"use client";

import { Cast, CircleStop } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bot, BotError } from "@/lib/bot/client";
import { castSupported, CastStartError, startCast, type CastHandle } from "@/lib/bot/cast";
import type { PlayerState } from "@/lib/bot/types";
import { keys } from "@/lib/bot/useBotState";
import { useLocalValue } from "@/lib/useLocalValue";
import { Badge, Button, Card, inputClass, Notice } from "../../ui";

const SNOWFLAKE = /^\d{17,20}$/;

// Plays a browser tab's sound into the voice channel. The site itself stays in
// its own tab; only its audio comes here.
export function CastPanel({ state, enabled }: { state: PlayerState; enabled: boolean }) {
  const client = useQueryClient();
  const [name, setName] = useLocalValue("portal.bot.castName");
  const [channelId] = useLocalValue("portal.bot.voiceChannelId");
  const [muteHere, setMuteHere] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<CastHandle | null>(null);
  const [mine, setMine] = useState(false);
  // Read after mount: the browser check cannot run during server rendering.
  const [supported, setSupported] = useState(true);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability, known only on the client
  useEffect(() => setSupported(castSupported()), []);
  useEffect(() => () => handle.current?.stop(), []);

  const refresh = () => void client.invalidateQueries({ queryKey: keys.music });
  const live = state.cast;
  const label = name.trim() || "DM";

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      handle.current = await startCast({
        name: label,
        channelId: SNOWFLAKE.test(channelId.trim()) ? channelId.trim() : undefined,
        muteHere,
        onEnd: (reason) => {
          handle.current = null;
          setMine(false);
          if (reason && reason !== "Stopped.") setError(reason);
          refresh();
        },
      });
      setMine(true);
    } catch (caught) {
      setError(caught instanceof BotError || caught instanceof CastStartError ? caught.message : "Could not start the cast.");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const stop = () => {
    if (handle.current) handle.current.stop();
    else void bot.castStop().then(refresh, refresh);
  };

  return (
    <Card title="Cast a tab" icon={Cast} action={live ? <Badge tone="danger" dot>{`Live: ${live.by_name}`}</Badge> : undefined}>
      <p className=" text-sm text-muted">
        Open YouTube or any site in another tab and start it playing. Then press Cast and pick that tab, with &ldquo;Also share tab audio&rdquo; ticked. Players hear it about a second later.
      </p>

      {!supported ? (
        <div className="mt-4">
          <Notice tone="warn">Casting needs desktop Chrome or Edge. Firefox, Safari and phones cannot share a tab&rsquo;s sound.</Notice>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Shown as</span>
            <input
              className={`${inputClass} h-9 w-44`}
              maxLength={40}
              placeholder="DM"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={mine}
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={muteHere} disabled={mine} onChange={(event) => setMuteHere(event.target.checked)} />
            Mute the tab here (you hear it through Discord)
          </label>
          <div className="ml-auto flex gap-2">
            {live && (
              <Button variant="secondary" icon={CircleStop} disabled={!enabled} onClick={stop}>
                Stop casting
              </Button>
            )}
            {!mine && (
              <Button variant="primary" icon={Cast} disabled={!enabled} busy={busy} onClick={start}>
                {live ? "Take over" : "Cast a tab"}
              </Button>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
    </Card>
  );
}
