import Link from "next/link";
import { connection } from "next/server";
import { Plug, TriangleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getConnectionStatus } from "@/meta/store";

/** Selo no topo: estado da conexão com a Meta. */
export async function ConnectionBadge() {
  await connection();
  const s = getConnectionStatus();
  const connected = s.state === "ok" || s.state === "expiring";
  const dot =
    s.state === "ok" ? "bg-success" : s.state === "expiring" ? "bg-warning" : s.state === "expired" ? "bg-destructive" : "bg-muted-foreground/50";
  const label =
    s.state === "ok"
      ? s.userName ?? "Meta conectada"
      : s.state === "expiring"
        ? `Expira em ${s.daysLeft} dia(s)`
        : s.state === "expired"
          ? "Conexão expirada"
          : "Meta não conectada";
  return (
    <Link href="/conectar" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "max-w-[60vw] gap-2")}>
      <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden />
      {!connected && <Plug className="size-3.5" />}
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function ConnectionBadgeFallback() {
  return (
    <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2 text-muted-foreground")}>
      <span className="size-2 rounded-full bg-muted-foreground/30" aria-hidden />
      Meta…
    </span>
  );
}

/** Faixa de aviso quando a conexão está para expirar ou já expirou (PLANO §6.1). */
export async function ConnectionBanner() {
  await connection();
  const s = getConnectionStatus();
  if (s.state !== "expiring" && s.state !== "expired") return null;
  const expired = s.state === "expired";
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm",
        expired ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-foreground",
      )}
    >
      <TriangleAlert className="size-4 shrink-0" />
      {expired
        ? "Sua conexão com a Meta expirou. Reconecte para continuar migrando."
        : `Sua conexão com a Meta expira em ${s.daysLeft} dia(s).`}
      <a href="/api/auth/login" className="font-semibold underline underline-offset-2">
        Reconectar agora
      </a>
    </div>
  );
}
