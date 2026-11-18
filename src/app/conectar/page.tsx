import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { CircleAlert, CircleCheck, ExternalLink, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { CopyField } from "@/components/connect/copy-field";
import { AppForm } from "@/components/connect/app-form";
import { TokenForm } from "@/components/connect/token-form";
import { DisconnectButton, RefreshAccountsButton, ResetAppButton } from "@/components/connect/connection-actions";
import { AccountPicker } from "@/components/accounts/account-picker";
import { FormMessage } from "@/components/connect/form-message";
import { getAccountTree } from "@/meta/accounts";
import { redirectUri } from "@/meta/auth";
import { OAUTH_SCOPES } from "@/meta/fields";
import { getConnectionStatus, type ConnectionStatus } from "@/meta/store";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Conectar Meta" };

export default function ConectarPage({ searchParams }: PageProps<"/conectar">) {
  return (
    <>
      <PageHeader
        title="Conexão com a Meta"
        description="O Migra Ads usa um app da Meta que é só seu. Tudo fica neste computador."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <ConnectPanel searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ConnectPanel({ searchParams }: { searchParams: PageProps<"/conectar">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const status = getConnectionStatus();
  const port = process.env.PORT || "3000";

  return (
    <div className="space-y-6">
      {one("erro") && <FormMessage>{one("erro") === "app" ? "Configure o app da Meta primeiro." : one("erro")}</FormMessage>}
      {one("aviso") && <FormMessage>{one("aviso")}</FormMessage>}
      {one("ok") && status.state !== "app_missing" && status.state !== "disconnected" && (
        <FormMessage ok>
          Conectado como {status.userName}.
          {one("faltam") && ` Faltam permissões: ${one("faltam")}.`}
        </FormMessage>
      )}

      {status.state === "app_missing" ? (
        <SetupWizard port={port} />
      ) : status.state === "disconnected" ? (
        <LoginStep status={status} port={port} />
      ) : (
        <Connected status={status} />
      )}
    </div>
  );
}

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
              done ? "bg-success text-white" : "bg-primary-soft text-primary",
            )}
          >
            {done ? "✓" : n}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}

function SetupWizard({ port }: { port: string }) {
  return (
    <div className="space-y-4">
      <Card className="bg-primary-soft/60 ring-primary/20">
        <CardContent className="flex gap-3 py-1 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <p>
            Leva uns 10 minutos e é feito <strong>uma vez só</strong>. O app fica em <strong>modo de desenvolvimento</strong>:
            só você usa, sem análise da Meta e <strong>sem precisar publicar</strong>.
          </p>
        </CardContent>
      </Card>

      <Step n={1} title="Crie o seu app na Meta">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Abra o Meta for Developers e entre com o seu Facebook.</li>
          <li>
            Clique em <strong>Criar app</strong>. Nome sugerido: <em>Migra Ads (pessoal)</em>.
          </li>
          <li>
            Caso de uso: <strong>“Criar e gerenciar anúncios com a API de Marketing”</strong> (ou o nome parecido).
          </li>
          <li>Se pedir um portfólio de negócios, pode escolher qualquer um. Isso não limita as contas que o app enxerga.</li>
        </ol>
        <a
          href="https://developers.facebook.com/apps/creation/"
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Abrir o Meta for Developers <ExternalLink data-icon="inline-end" />
        </a>
        <p className="text-xs text-muted-foreground">Já tem um app? Pode usar ele e pular para o passo 2.</p>
      </Step>

      <Step n={2} title="Cadastre o endereço de retorno do login">
        <p>
          No painel do app, adicione o produto <strong>Login do Facebook</strong> (ou “Login do Facebook para Empresas”). Em{" "}
          <strong>Configurações</strong>, no campo <strong>URIs de redirecionamento do OAuth válidos</strong>, cole:
        </p>
        <CopyField value={redirectUri(port)} label="endereço de retorno" />
        <p className="text-xs text-muted-foreground">
          Se a Meta disser que <code>localhost</code> já é permitido automaticamente em modo de desenvolvimento, tudo bem:
          siga em frente.
        </p>
      </Step>

      <Step n={3} title="Cole o ID e a chave secreta do app">
        <AppForm />
      </Step>

      <Step n={4} title="Entre com o Facebook">
        <p className="text-muted-foreground">Libera depois do passo 3.</p>
      </Step>
    </div>
  );
}

function LoginStep({ status, port }: { status: ConnectionStatus; port: string }) {
  return (
    <div className="space-y-4">
      <Step n={1} title="App da Meta configurado" done>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>
            <strong>{status.appName ?? "App"}</strong> <span className="text-muted-foreground">· ID {status.appId}</span>
          </p>
          <ResetAppButton />
        </div>
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Endereço de retorno e dados do app</summary>
          <div className="mt-3 space-y-3">
            <CopyField value={redirectUri(port)} label="endereço de retorno" />
            <AppForm currentAppId={status.appId} />
          </div>
        </details>
      </Step>

      <Step n={2} title="Entre com o Facebook">
        <p>
          A Meta vai pedir para você autorizar o app a ler e criar anúncios nas suas contas. As permissões são:
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {OAUTH_SCOPES.map((s) => (
            <li key={s}>
              <Badge variant="outline" className="font-mono">
                {s}
              </Badge>
            </li>
          ))}
        </ul>
        {/* Link comum (não <Link>): sai do app para o login da Meta. */}
        <a href="/api/auth/login" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
          Entrar com Facebook
        </a>
      </Step>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" /> Modo avançado: colar um token
          </CardTitle>
          <CardDescription>
            Use se o login acima não funcionar no seu app, ou se você tiver um token de usuário do sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TokenForm />
        </CardContent>
      </Card>
    </div>
  );
}

function Connected({ status }: { status: ConnectionStatus }) {
  const tree = getAccountTree();
  const expires = status.expiresAt ? new Date(status.expiresAt).toLocaleDateString("pt-BR") : null;
  const missing = OAUTH_SCOPES.filter((s) => !status.scopes?.includes(s));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-1">
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-full",
              status.state === "ok" ? "bg-success/15 text-success" : status.state === "expiring" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive",
            )}
          >
            {status.state === "ok" ? <CircleCheck /> : status.state === "expiring" ? <TriangleAlert /> : <CircleAlert />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {status.state === "expired" ? "Conexão expirada" : `Conectado como ${status.userName}`}
            </p>
            <p className="text-sm text-muted-foreground">
              App {status.appName ?? status.appId}
              {status.kind === "system_user" && " · usuário do sistema"}
              {expires
                ? status.state === "expired"
                  ? ` · expirou em ${expires}`
                  : ` · válida até ${expires} (${status.daysLeft} dias)`
                : " · não expira"}
            </p>
            {missing.length > 0 && (
              <p className="mt-1 text-xs text-warning">Faltam permissões: {missing.join(", ")}. Reconecte marcando todas.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/auth/login"
              className={buttonVariants({ variant: status.state === "ok" ? "outline" : "default", size: "sm" })}
            >
              Reconectar
            </a>
            <DisconnectButton />
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Suas contas de anúncios</h2>
            <p className="text-sm text-muted-foreground">
              {tree
                ? `${tree.total} contas em ${tree.businesses.length} portfólios · atualizado em ${new Date(tree.fetchedAt).toLocaleString("pt-BR")}`
                : "Ainda não lidas."}
            </p>
          </div>
          <RefreshAccountsButton />
        </div>
        {tree ? (
          <AccountPicker tree={tree} />
        ) : (
          <p className="text-sm text-muted-foreground">Clique em “Atualizar contas”.</p>
        )}
      </div>
    </div>
  );
}
