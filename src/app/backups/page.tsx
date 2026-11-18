import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight, CircleAlert, CircleCheck, Info, Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { JobRow } from "@/components/backup/job-row";
import { getAccountTree, findAccount, type AccountSummary } from "@/meta/accounts";
import { getConnectionStatus } from "@/meta/store";
import { listBackups, listJobs } from "@/backup/store";
import { deleteBackupAction, migrateFromBackupAction } from "./actions";

export const metadata: Metadata = { title: "Backups" };

export default function BackupsPage() {
  return (
    <>
      <PageHeader
        title="Backups automáticos"
        description="Opcional. Guarda a estrutura das campanhas no seu computador para migrar mesmo se a conta cair ou você perder o acesso."
      />
      <p className="mb-6 flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        O backup automático só roda com o computador ligado e o Migra Ads aberto. Os arquivos ficam em <code>data/backups</code>.
      </p>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Content />
      </Suspense>
    </>
  );
}

function uniqueAccounts(tree: ReturnType<typeof getAccountTree>): AccountSummary[] {
  if (!tree) return [];
  const map = new Map<string, AccountSummary>();
  [...tree.personal, ...tree.businesses.flatMap((b) => [...b.owned, ...b.client])].forEach((a) => map.set(a.id, a));
  return [...map.values()].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));
}

async function Content() {
  await connection();
  const status = getConnectionStatus();
  if (status.state !== "ok" && status.state !== "expiring") {
    return (
      <p className="text-sm">
        Conecte sua conta da Meta primeiro: <Link href="/conectar" className="text-primary underline">Conexão</Link>.
      </p>
    );
  }
  const tree = getAccountTree();
  const jobs = new Map(listJobs().map((j) => [j.adAccountId, j]));
  const accounts = uniqueAccounts(tree);
  const backups = listBackups();
  const nameOf = (id: string) => findAccount(tree, id)?.name ?? id;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-base font-semibold">Contas</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {accounts.map((a) => {
            const j = jobs.get(a.id);
            return (
              <JobRow
                key={a.id}
                account={a.id}
                name={a.name}
                meta={`${a.accountId} · ${a.statusLabel}${a.owner ? ` · ${a.owner.name}` : ""}`}
                lastRun={j?.lastRunAt}
                nextRun={j?.nextRunAt}
                initial={{
                  enabled: j?.enabled ?? false,
                  frequencyHours: j?.frequencyHours ?? 24,
                  scope: j?.scope ?? "active",
                  includeMedia: j?.includeMedia ?? false,
                  retention: j?.retention ?? 7,
                }}
              />
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Histórico</h2>
        {!backups.length ? (
          <p className="text-sm text-muted-foreground">Nenhum backup ainda. Ligue o automático ou clique em “Fazer backup agora”.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {backups.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                {b.status === "done" ? (
                  <CircleCheck className="size-4 text-success" />
                ) : b.status === "running" ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : (
                  <CircleAlert className="size-4 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{nameOf(b.adAccountId)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(b.startedAt).toLocaleString("pt-BR")}
                    {b.stats && ` · ${b.stats.campaigns} campanha(s), ${b.stats.adsets} conjunto(s), ${b.stats.ads} anúncio(s)`}
                    {b.stats?.media && ` · ${b.stats.media.images} imagem(ns), ${b.stats.media.videos} vídeo(s)`}
                    {b.error && <span className="text-destructive"> · {b.error}</span>}
                  </p>
                </div>
                {b.status === "done" && (b.stats?.campaigns ?? 0) > 0 && (
                  <form action={migrateFromBackupAction.bind(null, b.id)}>
                    <Button type="submit" size="sm">
                      Migrar a partir deste backup <ArrowRight data-icon="inline-end" />
                    </Button>
                  </form>
                )}
                {b.status === "done" && b.stats?.campaigns === 0 && <Badge variant="secondary">sem campanhas ativas</Badge>}
                <form action={deleteBackupAction.bind(null, b.id)}>
                  <Button type="submit" variant="ghost" size="icon-sm" aria-label="Excluir backup" title="Excluir backup">
                    <Trash2 />
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <Link href="/migracoes" className={buttonVariants({ variant: "link", size: "sm" }) + " mt-2 px-0"}>
          Ver migrações
        </Link>
      </section>
    </div>
  );
}
