import { ArrowLeft, Dices, Headphones, Mic, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { ThemeMenu } from "@/components/settings/ThemeMenu";
import { safeCallbackUrl } from "@/lib/session";
import { parseTheme, THEME_COOKIE, themeArt } from "@/lib/theme";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  AccessDenied: "This Discord account is not allowed in. You need to be in the campaign server and hold the admin role.",
  Configuration: "The portal is misconfigured. Check the server logs.",
  Verification: "The sign-in link expired. Try again.",
};

const FEATURES = [
  { icon: Mic, title: "Record sessions", text: "Start, stop and recover recordings from any device." },
  { icon: Headphones, title: "Run the music", text: "Library, queue and volume from your phone at the table." },
  { icon: ShieldCheck, title: "Admins only", text: "Access follows your role in the campaign server." },
];

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const session = await auth();
  if (session?.user?.id) redirect(callbackUrl);

  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const art = themeArt(theme);

  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const error = errorKey ? (ERRORS[errorKey] ?? "Sign-in failed. Try again.") : undefined;

  return (
    <main className="relative grid min-h-dvh lg:grid-cols-2">
      <ThemeMenu initial={theme} />
      {/* Brand side. The theme artwork fills it; the fades keep the text readable on any theme. */}
      <section className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col lg:justify-end lg:p-12">
        {/* eslint-disable-next-line @next/next/no-img-element -- static theme art from /public, allowed by CSP */}
        <img src={art} alt="" fetchPriority="high" className="pointer-events-none absolute inset-0 size-full object-cover" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-bg/85 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-bg/95 via-bg/70 to-transparent" aria-hidden />
        <div className="relative mb-auto flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-fg">
            <Dices className="size-6" aria-hidden />
          </span>
          <span className="text-lg font-semibold">Portal</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">The control room for your campaign.</h2>
          <ul className="mt-8 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-accent">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <div className="font-medium">{title}</div>
                  <div className="text-sm text-muted">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-8 text-xs text-muted">Roll for initiative.</p>
      </section>

      {/* Sign-in side */}
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-fg lg:hidden">
            <Dices className="size-6" aria-hidden />
          </span>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight lg:mt-0">Welcome back</h1>
          <p className="mt-2 text-sm text-muted">Sign in with the Discord account you use in the campaign server.</p>

          {error && (
            <p role="alert" className="mt-6 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
              {error}
            </p>
          )}

          <form
            className="mt-8"
            action={async () => {
              "use server";
              await signIn("discord", { redirectTo: callbackUrl });
            }}
          >
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-br from-accent-strong to-accent-2 font-medium text-accent-fg shadow-[0_12px_32px_-12px_var(--accent)] transition hover:brightness-110"
            >
              Continue with Discord
            </button>
          </form>

          <Link
            href="/demo"
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface-2 font-medium transition hover:bg-surface-3"
          >
            Try the demo
          </Link>
          <p className="mt-2 text-center text-xs text-muted">Made-up data, no account needed.</p>

          <p className="mt-6 flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            The portal only reads your roles in the campaign server to check access. It never sees your email or messages.
          </p>
          <p className="mt-4 text-xs text-muted">
            By continuing you agree to the{" "}
            <Link href="/terms" className="text-accent hover:underline">
              terms
            </Link>{" "}
            and accept the{" "}
            <Link href="/privacy" className="text-accent hover:underline">
              privacy
            </Link>{" "}
            and{" "}
            <Link href="/cookies" className="text-accent hover:underline">
              cookie
            </Link>{" "}
            policies.
          </p>
          <a
            href="https://yangil.net"
            className="group mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2/60 py-1.5 pl-3 pr-4 text-sm font-medium text-text transition hover:border-accent/60 hover:text-accent"
          >
            <ArrowLeft className="size-4 text-muted transition group-hover:-translate-x-0.5 group-hover:text-accent" aria-hidden />
            Back to yangil.net
          </a>
        </div>
      </section>
    </main>
  );
}
