import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight, History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { findAccount, getAccountTree } from "@/meta/accounts";
import { listMigrations, MIGRATION_STATUS } from "@/meta/migrations";

export const metadata: Metadata = { title: "Migrações" };

export default function MigracoesPage() {
  return (
    <>
      <PageHeader
        title="Migrações"
        description="Rascunhos, histórico e relatórios."
        actions={
          <Link href="/migrar" className={buttonVariants({ size: "sm" })}>
            Nova migração
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
        <List />
      </Suspense>
    </>
  );
}

async function List() {
  await connection();
  const items = listMigrations();
  const tree = getAccountTree();
  if (!items.length) {
    return (
      <ComingSoon
        icon={History}
        title="Nenhuma migração ainda"
        description="Escolha uma conta de origem, marque o que levar e clique em Continuar: a migração aparece aqui."
      >
        <Link href="/migrar" className={buttonVariants()}>
          Começar uma migração
        </Link>
      </ComingSoon>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {items.map((m) => (
        <li key={m.id}>
          <Link href={`/migracoes/${m.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{m.resolved.map((c) => c.name).join(", ") || "Sem itens"}</p>
              <p className="text-xs text-muted-foreground">
                De {findAccount(tree, m.sourceAccountId)?.name ?? m.sourceAccountId} · {m.counts.campaigns} campanha(s) ·{" "}
                {m.counts.ads} anúncio(s) · {new Date(m.createdAt).toLocaleString("pt-BR")}
              </p>
            </div>
            <Badge variant={m.status === "draft" ? "secondary" : "default"}>{MIGRATION_STATUS[m.status]}</Badge>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
