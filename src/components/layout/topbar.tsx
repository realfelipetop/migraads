import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { ConnectionBadge, ConnectionBadgeFallback } from "./connection-status";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur md:px-6">
      <Link href="/" className="md:hidden" aria-label="Migra Ads — início">
        <LogoMark className="size-7" />
      </Link>
      <div className="flex-1" />
      <Suspense fallback={<ConnectionBadgeFallback />}>
        <ConnectionBadge />
      </Suspense>
      <ThemeToggle />
    </header>
  );
}
