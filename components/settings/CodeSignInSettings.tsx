"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldOff } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/Providers";
import { Badge, Button, Card, Notice, Skeleton, inputClass } from "@/components/ui";
import { TOTP_KEY, totpApi, type TotpSetup } from "@/lib/totp/client";

/** Set up, confirm and turn off "sign in with a code"; the owner also sees who has it. */
export function CodeSignInSettings({ owner }: { owner: boolean }) {
  const client = useQueryClient();
  const toast = useToast();
  const status = useQuery({ queryKey: TOTP_KEY, queryFn: totpApi.status });
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");

  const refresh = () => client.invalidateQueries({ queryKey: TOTP_KEY });
  const start = useMutation({
    mutationFn: totpApi.setup,
    onSuccess: (result) => {
      setSetup(result);
      setCode("");
      return refresh();
    },
    onError: () => toast("danger", "Could not start the setup."),
  });
  const confirm = useMutation({
    mutationFn: () => totpApi.confirm(code.trim()),
    onSuccess: () => {
      setSetup(null);
      toast("ok", "Code sign-in is on. You can use it on any device.");
      return refresh();
    },
    onError: () => toast("danger", "That code is not right. Check the app and try again."),
  });
  const remove = useMutation({
    mutationFn: totpApi.remove,
    onSuccess: () => {
      setSetup(null);
      toast("ok", "Code sign-in is off.");
      return refresh();
    },
    onError: () => toast("danger", "Could not turn it off."),
  });

  const current = status.data?.status;

  return (
    <div className="space-y-6">
      <Card title="Sign-in code" subtitle="Sign in with an authenticator app instead of Discord" icon={KeyRound}>
        {status.isPending ? <Skeleton className="h-16 w-full" /> : null}
        {status.isError ? <Notice>Could not load your status.</Notice> : null}

        {current ? (
          <p className="mb-4 flex items-center gap-2 text-sm">
            Status: <Badge tone={current === "active" ? "ok" : "neutral"}>{current === "active" ? "On" : current === "pending" ? "Setup not finished" : "Off"}</Badge>
          </p>
        ) : null}

        {!setup ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Works with the Passwords app on iPhone, Google Authenticator, Aegis or any authenticator app. It is free. After this, pick your name on the sign-in page and type the code; Discord is not needed on that device.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={KeyRound} busy={start.isPending} onClick={() => start.mutate()}>
                {current === "active" ? "Set up again" : "Set up"}
              </Button>
              {current && current !== "none" ? (
                <Button icon={ShieldOff} busy={remove.isPending} onClick={() => remove.mutate()}>
                  Turn off
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>Open your authenticator app and add an account (scan the code, or type the key).</li>
              <li>Type the 6-digit code it shows to finish.</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL, allowed by CSP */}
            <img src={setup.qr} alt="QR code for your authenticator app" width={220} height={220} className="rounded-xl bg-white p-2" />
            <div className="text-sm">
              <div className="text-muted">On this phone? Open the link, or copy the key:</div>
              <a href={setup.uri} className="text-accent underline-offset-2 hover:underline">
                Open in authenticator app
              </a>
              <div className="mt-1 select-all break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">{setup.secret}</div>
            </div>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                placeholder="123456"
                aria-label="6-digit code"
              />
              <Button variant="primary" busy={confirm.isPending} disabled={code.trim().length < 6} onClick={() => confirm.mutate()}>
                Confirm
              </Button>
            </div>
          </div>
        )}
      </Card>

      {owner ? <Members /> : null}
    </div>
  );
}

function Members() {
  const client = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: [...TOTP_KEY, "users"], queryFn: totpApi.users });
  const remove = useMutation({
    mutationFn: totpApi.removeUser,
    onSuccess: () => {
      toast("ok", "Turned off for that player.");
      return client.invalidateQueries({ queryKey: [...TOTP_KEY, "users"] });
    },
    onError: () => toast("danger", "Could not turn it off."),
  });
  return (
    <Card title="Players with code sign-in" subtitle="Turn one off if someone left the group. Their sessions end at the next request.">
      {list.isPending ? <Skeleton className="h-16 w-full" /> : null}
      {list.data && list.data.users.length === 0 ? <p className="text-sm text-muted">Nobody yet.</p> : null}
      <ul className="space-y-2">
        {list.data?.users.map((user) => (
          <li key={user.userId} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
            <span className="text-sm font-medium">{user.displayName}</span>
            <Button size="sm" busy={remove.isPending && remove.variables === user.userId} onClick={() => remove.mutate(user.userId)}>
              Turn off
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
