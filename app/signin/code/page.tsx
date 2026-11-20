import { ArrowLeft, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { safeCallbackUrl } from "@/lib/session";
import { codeCards, verifyCodeSignIn } from "@/lib/totp/action";

export const metadata: Metadata = { title: "Sign in with a code" };
export const dynamic = "force-dynamic";

const SNOWFLAKE = /^\d{17,20}$/;

export default async function CodeSignInPage({ searchParams }: PageProps<"/signin/code">) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  if ((await auth())?.user?.id) redirect(callbackUrl);

  const cards = codeCards();
  const picked = typeof params.user === "string" && SNOWFLAKE.test(params.user) ? params.user : undefined;
  const failed = params.error === "1";

  async function submit(formData: FormData) {
    "use server";
    const userId = String(formData.get("user") ?? "");
    const target = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""));
    const back = `/signin/code?error=1${SNOWFLAKE.test(userId) ? `&user=${userId}` : ""}${target !== "/" ? `&callbackUrl=${encodeURIComponent(target)}` : ""}`;
    const ticket = await verifyCodeSignIn(userId, String(formData.get("code") ?? ""));
    if (!ticket) redirect(back);
    try {
      await signIn("totp", { ticket, redirectTo: target });
    } catch (error) {
      // A redirect is how a successful sign-in ends; only real auth failures come back here.
      if (error instanceof AuthError) redirect(back);
      throw error;
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-fg">
          <KeyRound className="size-6" aria-hidden />
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Sign in with a code</h1>
        <p className="mt-2 text-sm text-muted">Pick your name, then type the 6-digit code from your authenticator app. No Discord needed.</p>

        {failed ? (
          <p role="alert" className="mt-6 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
            That did not work. Check the code and try again. After five wrong codes a card is locked for 15 minutes.
          </p>
        ) : null}

        {cards.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted">
            Nobody has set up code sign-in yet. Sign in with Discord once, then open Settings and choose &ldquo;Sign-in code&rdquo;.
          </p>
        ) : (
          <form action={submit} className="mt-8 space-y-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <fieldset className="space-y-2">
              <legend className="sr-only">Who are you?</legend>
              {cards.map((card) => (
                <label
                  key={card.userId}
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface-2 px-4 transition has-[:checked]:border-accent has-[:checked]:bg-surface-3"
                >
                  <input type="radio" name="user" value={card.userId} defaultChecked={card.userId === picked} required className="size-4" />
                  {card.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Discord CDN avatar, allowed by CSP
                    <img src={card.avatarUrl} alt="" className="size-8 rounded-full" />
                  ) : (
                    <span className="grid size-8 place-items-center rounded-full bg-surface-3 text-sm font-medium" aria-hidden>
                      {card.displayName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="font-medium">{card.displayName}</span>
                </label>
              ))}
            </fieldset>
            <label className="block text-sm font-medium">
              Code
              <input
                name="code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                placeholder="123456"
                className="mt-1.5 h-12 w-full rounded-xl border border-border-strong bg-surface-2 px-4 text-center text-xl tracking-[0.3em]"
              />
            </label>
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-br from-accent-strong to-accent-2 font-medium text-accent-fg transition hover:brightness-110"
            >
              Sign in
            </button>
          </form>
        )}

        <Link href="/signin" className="mt-6 inline-flex items-center gap-2 text-sm text-muted hover:text-text">
          <ArrowLeft className="size-4" aria-hidden />
          Other ways to sign in
        </Link>
      </div>
    </main>
  );
}
