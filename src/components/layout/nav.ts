import { ArrowRightLeft, DatabaseBackup, History, House, Info, Network, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_MAIN: NavItem[] = [
  { href: "/", label: "Início", icon: House },
  { href: "/migrar", label: "Nova migração", icon: ArrowRightLeft },
  { href: "/migracoes", label: "Migrações", icon: History },
  { href: "/backups", label: "Backups", icon: DatabaseBackup },
];

export const NAV_SECONDARY: NavItem[] = [
  { href: "/estrutura-recomendada", label: "Estrutura recomendada", icon: Network },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
  { href: "/sobre", label: "Sobre", icon: Info },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
