import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getSystemStatus } from "@/lib/system-status";
import Link from "next/link";
import { connection } from "next/server";
import { buttonVariants } from "@/components/ui/button";
import { UtmifyForm } from "@/components/utmify/utmify-form";
import { getUtmifyConfig } from "@/integrations/utmify";

export const metadata: Metadata = { title: "Configurações" };

export default function ConfiguracoesPage() {
  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Conexão com a Meta</CardTitle>
            <CardDescription>App da Meta, login com Facebook, validade e reconexão.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/conectar" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Abrir conexão
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Integração com a Utmify <Badge variant="secondary">opcional</Badge>
            </CardTitle>
            <CardDescription>
              Mostra o resultado real (lucro, ROAS e CPA) da conta de origem no Explorador. Usa a API oficial da Utmify, que hoje só
              funciona nos planos Monster, Scale e Enterprise e está em beta. Ela traz o resumo da conta, não de cada campanha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-24 w-full" />}>
              <Utmify />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pasta de dados</CardTitle>
            <CardDescription>Banco, backups e mídias ficam aqui. Ela nunca vai para o Git.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-4 w-3/4" />}>
              <DataDir />
            </Suspense>
            <p className="mt-2 text-xs text-muted-foreground">
              Para usar outra pasta, inicie com a variável <code>MIGRA_DATA_DIR</code>.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Idioma</CardTitle>
            <CardDescription>Português (Brasil).</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}

async function Utmify() {
  await connection();
  const cfg = getUtmifyConfig();
  return <UtmifyForm connectedDashboard={cfg?.dashboardId} />;
}

async function DataDir() {
  const s = await getSystemStatus();
  return <code className="block break-all rounded-md bg-muted px-2 py-1.5 text-xs">{s.dataDir}</code>;
}
