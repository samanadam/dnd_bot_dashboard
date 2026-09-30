"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, type ComponentProps } from "react";
import { isDemoPath, withBase } from "@/lib/demo/base";

// Links and navigation inside the portal. The same components render the real
// portal and the demo, so an in-portal path such as /dm/npcs is kept under
// /demo while the demo is showing and left alone everywhere else.

export function useInDemo(): boolean {
  return isDemoPath(usePathname() ?? "");
}

export function usePortalHref(): (href: string) => string {
  const demo = useInDemo();
  return (href) => withBase(href, demo);
}

export function PortalLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const demo = useInDemo();
  return <Link href={withBase(href, demo)} {...props} />;
}

export function usePortalRouter() {
  const router = useRouter();
  const demo = useInDemo();
  return useMemo(
    () => ({
      ...router,
      push: (href: string) => router.push(withBase(href, demo)),
      replace: (href: string) => router.replace(withBase(href, demo)),
    }),
    [router, demo],
  );
}
