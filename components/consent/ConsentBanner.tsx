"use client";

import { Cookie } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CONSENT_OPEN_EVENT, consentSnapshot, parseConsent, saveConsent, subscribeConsent } from "@/lib/consent";

// Shown until the visitor chooses, and again whenever "Cookie settings" is
// pressed. Accept and reject are the same size and weight on purpose: refusing
// must be as easy as agreeing.

export function ConsentBanner() {
  // "" on the server and during hydration, so nothing flashes before we know.
  const raw = useSyncExternalStore(subscribeConsent, consentSnapshot, () => null);
  const consent = useMemo(() => parseConsent(raw), [raw]);
  const [reopened, setReopened] = useState(false);
  const [details, setDetails] = useState(false);
  const [preferences, setPreferences] = useState(false);

  useEffect(() => {
    const open = () => {
      setPreferences(parseConsent(consentSnapshot())?.preferences ?? false);
      setDetails(true);
      setReopened(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  const visible = raw !== null && (consent === null || reopened);
  if (!visible) return null;

  const choose = (value: boolean) => {
    saveConsent(value);
    setReopened(false);
    setDetails(false);
  };

  const button = "h-10 rounded-xl border border-border-strong bg-surface-2 px-4 text-sm font-medium transition hover:bg-surface-3";

  return (
    <section
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[70] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface-2 p-4 shadow-card sm:p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-accent">
            <Cookie className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <h2 className="font-semibold">Your cookie choices</h2>
            <p className="mt-1 text-muted">
              We always use the cookies needed to sign you in and remember this choice. With your OK we also keep your theme, selected campaign and remembered channels for a year instead of
              forgetting them when you close the browser. No analytics, no advertising, nothing shared with third parties. See the{" "}
              <Link href="/cookies" className="text-accent underline-offset-2 hover:underline">
                cookie policy
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-accent underline-offset-2 hover:underline">
                privacy policy
              </Link>
              .
            </p>

            {details && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-3">
                  <div>
                    <div className="font-medium">Strictly necessary</div>
                    <div className="text-xs text-muted">Sign-in session and this consent record. Always on.</div>
                  </div>
                  <span className="text-xs font-medium text-muted">Always on</span>
                </div>
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-surface p-3">
                  <span>
                    <span className="block font-medium">Preferences</span>
                    <span className="block text-xs text-muted">Keep theme, campaign and remembered channels for a year.</span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={preferences}
                    onChange={(event) => setPreferences(event.target.checked)}
                    className="size-5 shrink-0 accent-[var(--accent)]"
                  />
                </label>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={button} onClick={() => choose(false)}>
                Reject non-essential
              </button>
              <button type="button" className={button} onClick={() => choose(true)}>
                Accept all
              </button>
              {details ? (
                <button type="button" className={`${button} sm:ml-auto`} onClick={() => choose(preferences)}>
                  Save my choices
                </button>
              ) : (
                <button type="button" className={`${button} sm:ml-auto`} onClick={() => setDetails(true)}>
                  Customize
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
