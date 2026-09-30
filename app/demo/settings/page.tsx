import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DemoSignIn } from "@/components/demo/DemoFrame";
import { SettingsView } from "@/components/settings/SettingsView";
import { DEMO_USER } from "@/lib/demo/fixtures";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

export const metadata: Metadata = { title: "Settings" };

export default async function DemoSettingsPage() {
  // The theme is a plain display preference; the demo shares it with the portal.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return <SettingsView theme={theme} user={DEMO_USER} expires={null} signOut={<DemoSignIn />} />;
}
