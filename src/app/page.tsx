import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CircleAlert, CircleCheck, ClipboardCheck, ListChecks, Network, Plug, Rocket } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";
import { getSystemStatus } from "@/lib/system-status";
import { connection } from "next/server";
import { getConnectionStatus } from "@/meta/store";
import { findAccount, getAccountTree } from "@/meta/accounts";
import { listMigrations, MIGRATION_STATUS } from "@/meta/migrations";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  { icon: Plug, title: "Conecte a Meta", text: "Entre com o Facebook. O app enxerga as mesmas contas do seu Gerenciador." },
  { icon: ListChecks, title: "Escolha o que migrar", text: "Selecione campanhas, conjuntos e anúncios validados da conta de origem." },
  { icon: ClipboardCheck, title: "Revise o destino", text: "O app confere pixel, página e pagamento e mostra o que vai ser criado." },
  { icon: Rocket, title: "Migre", text: "Tudo é criado pausado, reaproveitando os posts, para você ativar quando quiser." },
];

export default function HomePage() {
  return (
    <>
      <PageHeader title="Bem-vindo ao Migra Ads" description={BRAND.tagline} />

      <Suspense fallback={<Skeleton className="mb-6 h-[104px] w-full rounded-xl" />}>
        <HeroCard />
      </Suspense>

      <Suspense fallback={null}>
        <RecentMigrations />
      </Suspense>

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Como funciona</h2>
      <ol className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <Card className="h-full">
              <CardHeader>
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <s.icon className="size-4 text-primary" />
                </div>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.text}</CardDescription>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<StatusSkeleton />}>
          <SystemStatusCard />
        </Suspense>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="size-4 text-primary" />
              Estrutura recomendada
            </CardTitle>
            <CardDescription>
              Com uma <strong>BM mãe</strong> guardando pixel, página e domínio, migrar quando uma conta cair vira o
              caso fácil: tudo já está compartilhado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/estrutura-recomendada" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Ver o guia
              <ArrowRight data-icon="inline-end" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function RecentMigrations() {
  await connection();
  const recent = listMigrations(5);
  if (!recent.length) return null;
  const tree = getAccountTree();
  const name = (id: string | null) => (id ? (findAccount(tree, id)?.name ?? id) : "—");
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Migrações recentes</h2>
        <Link href="/migracoes" className="text-sm text-primary hover:underline">
          Ver todas
        </Link>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {recent.map((m) => (
          <li key={m.id}>
            <Link href={`/migracoes/${m.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.resolved.map((c) => c.name).join(", ") || "Sem itens"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {name(m.sourceAccountId)} → {name(m.destAccountId)} · {m.counts.ads} anúncio(s)
                  {(m.options.copies ?? 1) > 1 && ` × ${m.options.copies} cópias`} ·{" "}
                  {new Date(m.createdAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <Badge variant={m.status === "done" ? "default" : "secondary"}>{MIGRATION_STATUS[m.status]}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function HeroCard() {
  await connection();
  const status = getConnectionStatus();
  const tree = getAccountTree();
  const connected = status.state === "ok" || status.state === "expiring";
  const title = connected
    ? `Conectado como ${status.userName}`
    : status.state === "expired"
      ? "Sua conexão com a Meta expirou"
      : "Comece conectando sua conta da Meta";
  const text = connected
    ? `${tree?.total ?? 0} contas de anúncios em ${tree?.businesses.length ?? 0} portfólios. Pronto para migrar.`
    : "O acesso fica só no seu computador, nada vai para servidores do Migra Ads.";

  return (
    <Card className="mb-6 border-0 bg-gradient-to-br from-[#1d6fe0] to-[#0b4db0] text-white ring-0">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-2">
        <div>
          <p className="text-base font-semibold">{title}</p>
          <p className="mt-1 text-sm text-white/80">{text}</p>
        </div>
        <Link
          href={connected ? "/migrar" : "/conectar"}
          className={cn(buttonVariants({ size: "lg" }), "bg-white text-[#0b4db0] hover:bg-white/90")}
        >
          {connected ? "Nova migração" : status.state === "expired" ? "Reconectar" : "Conectar conta da Meta"}
          <ArrowRight data-icon="inline-end" />
        </Link>
      </CardContent>
    </Card>
  );
}

async function SystemStatusCard() {
  const s = await getSystemStatus();
  const rows: [string, React.ReactNode][] = [
    [
      "Banco local",
      s.db.ok ? (
        <span className="inline-flex items-center gap-1.5 text-success">
          <CircleCheck className="size-3.5" /> Funcionando ({s.db.tables} tabelas)
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <CircleAlert className="size-3.5" /> {s.db.error}
        </span>
      ),
    ],
    ["Pasta de dados", <code key="d" className="break-all text-xs">{s.dataDir}</code>],
    ["Versão", `${s.version} · Graph API ${s.apiVersion}`],
    ["Sistema", `Node ${s.node} · ${s.platform}`],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status do sistema</CardTitle>
        <CardDescription>Tudo roda no seu computador.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function StatusSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status do sistema</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/5" />
      </CardContent>
    </Card>
  );
}
