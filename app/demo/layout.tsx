import type { Metadata } from "next";
import { DemoBanner, DemoSignIn } from "@/components/demo/DemoFrame";
import { DemoShell } from "@/components/demo/DemoShell";
import { Providers } from "@/components/Providers";

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
      <DemoShell signOut={<DemoSignIn />} banner={<DemoBanner />}>
        {children}
      </DemoShell>
    </Providers>
  );
}
