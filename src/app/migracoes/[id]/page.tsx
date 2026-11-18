import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  DatabaseBackup,
  Download,
  ExternalLink,
  Folder,
  Hand,
  LayoutGrid,
  Pencil,
  Square,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DestinationStep } from "@/components/migration/destination-step";
import { BackButton, StartButton } from "@/components/migration/run-buttons";
import { ExecutionView } from "@/components/migration/execution-view";
import { findAccount, getAccountTree, type AccountTree } from "@/meta/accounts";
import { adsManagerUrl, getItems, getMigration, MIGRATION_STATUS, type ItemRow, type MigrationView } from "@/meta/migrations";
import { reconcileInterrupted } from "@/migration/executor";
import { copySuffix } from "@/migration/mapper";
import { restrictionNotice } from "@/migration/precheck";
import { MappingPanel } from "@/components/migration/mapping-panel";
import { cn } from "@/lib/utils";
import { deleteDraftAction } from "../actions";

export const metadata: Metadata = { title: "Migração" };

export default function MigrationPage({ params }: PageProps<"/migracoes/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <MigrationDetail params={params} />
    </Suspense>
  );
}

const STEP: Record<string, string> = {
  draft: "Passo 3 de 4: escolha a conta de destino",
  planned: "Passo 4 de 4: revise antes de migrar",
};

async function MigrationDetail({ params }: { params: PageProps<"/migracoes/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  reconcileInterrupted(id);
  const m = getMigration(id);
  if (!m) notFound();
  const tree = getAccountTree();
  const source = findAccount(tree, m.sourceAccountId);
  const dest = m.destAccountId ? findAccount(tree, m.destAccountId) : undefined;
  const items = getItems(id);
  const started = !["draft", "planned"].includes(m.status);

  return (
    <>
      <PageHeader
        title={STEP[m.status] ?? "Migração"}
        description={
          <>
            Origem: <strong>{source?.name ?? m.sourceAccountId}</strong>
            {m.destAccountId && (
              <>
                {" "}
                <ArrowRight className="inline size-3.5" /> Destino: <strong>{dest?.name ?? m.destAccountId}</strong>
              </>
            )}
          </>
        }
        actions={<Badge variant={m.status === "done" ? "default" : "secondary"}>{MIGRATION_STATUS[m.status]}</Badge>}
      />

      {m.status === "draft" && <DraftView m={m} tree={tree} />}
      {m.status === "planned" && <ReviewView m={m} items={items} sourceStatus={source?.status} />}
      {started && (
        <div className="space-y-6">
          {["done", "done_with_issues", "failed"].includes(m.status) && <Report m={m} items={items} />}
          <ExecutionView
            migrationId={m.id}
            initialStatus={m.status}
            initialMessage={m.run?.message}
            initialItems={items.map((i) => ({
              id: i.id,
              level: i.level,
              name: i.name,
              status: i.status,
              destId: i.destId,
              error: i.error,
              copyIndex: i.copyIndex,
            }))}
          />
        </div>
      )}
    </>
  );
}

function Counts({ campaigns, adsets, ads }: { campaigns: number; adsets: number; ads: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        { icon: Folder, n: campaigns, label: "campanha(s)" },
        { icon: LayoutGrid, n: adsets, label: "conjunto(s)" },
        { icon: Square, n: ads, label: "anúncio(s)" },
      ].map((c) => (
        <Card key={c.label} size="sm">
          <CardContent className="flex items-center gap-3">
            <c.icon className="size-5 text-primary" />
            <span className="text-2xl font-semibold">{c.n}</span>
            <span className="text-sm text-muted-foreground">{c.label}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SelectionTree({ m }: { m: MigrationView }) {
  return (
    <div className="space-y-3">
      {m.resolved.map((c) => (
        <Card key={c.id} size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Folder className="size-4 text-primary" /> {c.name}
              {!c.whole && <Badge variant="outline">parcial</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {c.adsets.map((s) => (
              <div key={s.id} className="rounded-lg border border-border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <LayoutGrid className="size-4 text-muted-foreground" /> {s.name}
                  <span className="font-normal text-muted-foreground">· {s.ads.length} anúncio(s)</span>
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {s.ads.map((a) => (
                    <li key={a.id} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                      {a.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DraftView({ m, tree }: { m: MigrationView; tree: AccountTree | null }) {
  return (
    <div className="space-y-6">
      {m.options.fromBackup && (
        <p className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm">
          <DatabaseBackup className="mt-0.5 size-4 shrink-0 text-primary" />
          A partir de um backup: usa a cópia salva no seu computador, então funciona mesmo sem acesso à conta de origem.
        </p>
      )}
      <Counts {...m.counts} />
      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">Ver o que foi selecionado</summary>
        <div className="mt-3">
          <SelectionTree m={m} />
        </div>
      </details>

      <div>
        <h2 className="mb-1 text-base font-semibold">Conta de destino</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          O caso mais comum: outra conta da mesma BM, que já enxerga a página e o pixel.
        </p>
        {tree ? (
          <DestinationStep migrationId={m.id} tree={tree} sourceId={m.sourceAccountId} />
        ) : (
          <p className="text-sm">Atualize suas contas em Conexão.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {!m.options.fromBackup && (
          <Link href={`/migrar/${m.sourceAccountId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Pencil /> Escolher de novo
          </Link>
        )}
        <form action={deleteDraftAction.bind(null, m.id)}>
          <Button type="submit" variant="ghost" size="sm">
            <Trash2 /> Excluir rascunho
          </Button>
        </form>
      </div>
    </div>
  );
}

function CheckIcon({ level }: { level: string }) {
  if (level === "ok") return <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />;
  if (level === "warn") return <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />;
  return <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />;
}

function ReviewView({ m, items, sourceStatus }: { m: MigrationView; items: ItemRow[]; sourceStatus?: number }) {
  const plan = m.plan!;
  const restriction = sourceStatus !== undefined ? restrictionNotice(sourceStatus) : null;
  const blocked = plan.checks.some((c) => c.level === "block");
  const manual = items.filter((i) => i.status === "manual" && i.copyIndex === 1);
  const status = m.options.createStatus === "ACTIVE" ? "ATIVO" : "PAUSADO";
  const copies = m.options.copies ?? 1;

  return (
    <div className="space-y-6">
      {restriction && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <strong>A conta de origem está restrita.</strong> {restriction}
          </span>
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Diagnóstico do destino</CardTitle>
          <CardDescription>
            Verde: tudo certo. Amarelo: dá para migrar, mas confira. Vermelho: resolva antes (o mapeamento abaixo ajuda).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {plan.checks.map((c) => (
              <li key={c.id} className="flex gap-2">
                <CheckIcon level={c.level} />
                <span>
                  <strong className="font-medium">{c.label}</strong> <span className="text-muted-foreground">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {plan.needs && plan.candidates && plan.currency && (
        <MappingPanel
          migrationId={m.id}
          needs={plan.needs}
          candidates={plan.candidates}
          currency={plan.currency}
          initial={m.options.mappings}
        />
      )}

      <div>
        <h2 className="mb-3 text-base font-semibold">
          Vai ser criado <span className={cn(status === "ATIVO" ? "text-warning" : "text-primary")}>{status}</span>
          {copies > 1 ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · campanhas “…{copySuffix(m.options.suffix ?? "", copies, 1)}” até “…{copySuffix(m.options.suffix ?? "", copies, copies)}”
            </span>
          ) : m.options.suffix ? (
            <span className="font-normal text-muted-foreground"> · campanha com o sufixo “{m.options.suffix.trim()}”</span>
          ) : null}
        </h2>
        {copies > 1 && (
          <p className="mb-3 rounded-lg bg-primary-soft px-3 py-2 text-sm">
            <strong>Modo multiplicar: {copies} cópias.</strong> Os números abaixo são de <em>cada</em> cópia. No total:{" "}
            {plan.items.campaigns * copies} campanha(s), {plan.items.adsets * copies} conjunto(s) e{" "}
            {(plan.items.ads - plan.items.manual) * copies} anúncio(s), todos com os mesmos posts.
          </p>
        )}
        <Counts campaigns={plan.items.campaigns} adsets={plan.items.adsets} ads={plan.items.ads - plan.items.manual} />
        <p className="mt-2 text-sm text-muted-foreground">
          Cada anúncio reaproveita o post da origem: curtidas e comentários vão junto.
        </p>
      </div>

      {(plan.warnings.length > 0 || manual.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-warning" /> Avisos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {plan.warnings.map((w) => (
                <li key={w.text}>
                  • {w.text} {w.count > 1 && <span className="text-muted-foreground">({w.count}×)</span>}
                </li>
              ))}
              <li>
                • As melhorias Advantage+ do criativo podem ficar desligadas no destino: a Meta ignora esse campo pela API.
                Confira no Gerenciador.
              </li>
              <li>
                • Anúncios com post multi-formato (imagem recortada por posicionamento) só são descobertos na hora de criar: se
                aparecerem, viram “migrar manualmente” no relatório, com o link do original.
              </li>
              {manual.map((i) => (
                <li key={i.id} className="text-warning">
                  • {i.name}: {i.error}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">Ver a lista completa</summary>
        <div className="mt-3">
          <SelectionTree m={m} />
        </div>
      </details>

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border pt-4">
        <BackButton id={m.id} />
        <StartButton id={m.id} blocked={blocked} />
      </div>
      {blocked && <p className="text-right text-sm text-destructive">Resolva os itens em vermelho para migrar.</p>}
    </div>
  );
}

function Report({ m, items }: { m: MigrationView; items: ItemRow[] }) {
  const done = items.filter((i) => i.status === "done");
  const manual = items.filter((i) => i.status === "manual" && i.copyIndex === 1);
  const failed = items.filter((i) => i.status === "failed");
  const campaigns = items.filter((i) => i.level === "campaign" && i.destId);
  const ok = m.status === "done";

  return (
    <Card className={cn(ok ? "ring-success/30" : "ring-warning/30")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {ok ? <CircleCheck className="size-5 text-success" /> : <TriangleAlert className="size-5 text-warning" />}
          {m.status === "failed" ? "A migração não conseguiu criar a campanha" : ok ? "Migração concluída" : "Migração concluída com avisos"}
        </CardTitle>
        <CardDescription>
          {done.length} criado(s) · {manual.length} para migrar manualmente · {failed.length} com erro
          {m.finishedAt && ` · ${new Date(m.finishedAt).toLocaleString("pt-BR")}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <a href={`/api/migrations/${m.id}/report`} download className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download /> Exportar relatório (CSV)
          </a>
        </div>
        {campaigns.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {campaigns.map((c) => (
              <a
                key={c.id}
                href={adsManagerUrl.campaign(m.destAccountId!, c.destId!)}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ size: "sm" })}
              >
                Abrir “{c.name}” no Gerenciador <ExternalLink data-icon="inline-end" />
              </a>
            ))}
          </div>
        )}
        <p className="text-muted-foreground">
          Tudo foi criado {m.options.createStatus === "ACTIVE" ? "ATIVO" : "PAUSADO"}. Os anúncios novos passam pela análise da Meta e pela fase de
          aprendizado. Confira as melhorias Advantage+ antes de ativar.
        </p>
        {manual.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 font-medium">
              <Hand className="size-4 text-warning" /> Migrar manualmente ({manual.length})
            </p>
            <ul className="space-y-1">
              {manual.map((i) => (
                <li key={i.id}>
                  <a href={adsManagerUrl.ad(m.sourceAccountId, i.sourceId)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {i.name}
                  </a>{" "}
                  <span className="text-muted-foreground">: {i.error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
