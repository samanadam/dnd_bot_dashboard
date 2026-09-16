import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { auth, signOut } from "@/auth";
import { SettingsView } from "@/components/settings/SettingsView";
import { requireUser } from "@/lib/session";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const session = await auth();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <SettingsView
      theme={theme}
      user={{ id: user.id, name: user.name ?? null, image: user.image ?? null }}
      expires={session?.expires ?? null}
      signOut={
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button
            type="submit"
            aria-label="Sign out"
            className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-danger"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </form>
      }
    />
  );
}
