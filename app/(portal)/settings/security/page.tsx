import type { Metadata } from "next";
import { CodeSignInSettings } from "@/components/settings/CodeSignInSettings";
import { PageHeader } from "@/components/ui";
import { getAccess } from "@/lib/access/server";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign-in code" };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  await requireUser();
  const access = await getAccess();
  return (
    <div className="space-y-6">
      <PageHeader title="Sign-in code" description="Sign in on any device with an authenticator code, without Discord." />
      <CodeSignInSettings owner={access?.owner ?? false} />
    </div>
  );
}
