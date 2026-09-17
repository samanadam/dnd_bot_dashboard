import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { Providers } from "@/components/Providers";
import { requireUser } from "@/lib/session";
import { isDm } from "@/lib/dm/isDm";
import { env } from "@/lib/env";
import { visibleTools } from "@/lib/tools/registry";

export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  const signOutButton = (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/signin" });
      }}
    >
      <button
        type="submit"
        aria-label="Sign out"
        title="Sign out"
        className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-danger"
      >
        <LogOut className="size-4" aria-hidden />
      </button>
    </form>
  );

  return (
    <Providers>
      <AppShell tools={visibleTools(isDm(user.id, env().DM_USER_IDS))} user={{ name: user.name ?? null, image: user.image ?? null }} signOut={signOutButton}>
        {children}
      </AppShell>
    </Providers>
  );
}
