"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NAV_MAIN, NAV_SECONDARY, isActive, type NavItem } from "./nav";

/*
 * O destaque do item ativo depende do endereço da página (usePathname). No Next 16 com
 * Cache Components, isso precisa ficar dentro de <Suspense>; o fallback mostra o menu sem destaque.
 */

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}

function SideNav({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-2" aria-label="Principal">
      {NAV_MAIN.map((item) => (
        <SideLink key={item.href} item={item} active={!!pathname && isActive(pathname, item.href)} />
      ))}
      <div className="my-3 h-px bg-sidebar-border" />
      {NAV_SECONDARY.map((item) => (
        <SideLink key={item.href} item={item} active={!!pathname && isActive(pathname, item.href)} />
      ))}
    </nav>
  );
}

function ActiveSideNav() {
  return <SideNav pathname={usePathname()} />;
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center px-4">
        <Link href="/" aria-label="Migra Ads — início">
          <Logo />
        </Link>
      </div>
      <Suspense fallback={<SideNav pathname={null} />}>
        <ActiveSideNav />
      </Suspense>
    </aside>
  );
}

function MobileLinks({ pathname }: { pathname: string | null }) {
  return (
    <>
      {[...NAV_MAIN, ...NAV_SECONDARY].map((item) => {
        const Icon = item.icon;
        const active = !!pathname && isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-xs font-medium",
              active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function ActiveMobileLinks() {
  return <MobileLinks pathname={usePathname()} />;
}

/** Navegação compacta para telas estreitas (o app é pensado para desktop, mas funciona no celular). */
export function MobileNav() {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 md:hidden" aria-label="Principal">
      <Suspense fallback={<MobileLinks pathname={null} />}>
        <ActiveMobileLinks />
      </Suspense>
    </nav>
  );
}
