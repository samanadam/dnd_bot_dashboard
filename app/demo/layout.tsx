import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DemoBanner, DemoSignIn } from "@/components/demo/DemoFrame";
import { Providers } from "@/components/Providers";
import { DEMO_USER } from "@/lib/demo/fixtures";
import { tools } from "@/lib/tools/registry";

// The public demo. Deliberately no auth(), env(), database or bot here or in any
// page below: every page renders made-up data, and the browser clients answer
// from an in-memory store instead of calling /api (see lib/demo). proxy.ts lets
// /demo through without a session for that reason, and tests/demo.test.ts keeps
// server-side imports out of this folder.

export const metadata: Metadata = {
  title: { default: "Demo", template: "%s · Demo" },
  robots: { index: false, follow: false },
};

export default function DemoLayout({ children }: LayoutProps<"/demo">) {
  return (
    <Providers>
      <AppShell tools={tools} user={{ name: DEMO_USER.name, image: null }} signOut={<DemoSignIn />}>
        <DemoBanner />
        {children}
      </AppShell>
    </Providers>
  );
}
