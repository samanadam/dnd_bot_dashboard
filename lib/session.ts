import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Server-side gate for every portal page. Never trust the proxy alone. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user;
}

export { safeCallbackUrl } from "./callbackUrl";
