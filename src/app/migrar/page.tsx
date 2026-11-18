import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Plug } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { SourcePicker } from "@/components/accounts/source-picker";
import { getAccountTree } from "@/meta/accounts";
import { getConnectionStatus } from "@/meta/store";

export const metadata: Metadata = { title: "Nova migração" };

export default function MigrarPage() {
  return (
    <>
      <PageHeader
        title="Nova migração"
        description="Passo 1 de 4: escolha a conta de ORIGEM, de onde saem as campanhas validadas. Pode ser uma conta desativada: a leitura continua funcionando."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Picker />
      </Suspense>
    </>
  );
}

async function Picker() {
  await connection();
  const status = getConnectionStatus();
  const tree = getAccountTree();
  if (status.state !== "ok" && status.state !== "expiring") {
    return (
      <ComingSoon
        icon={Plug}
        title="Conecte sua conta da Meta primeiro"
        description="O Migra Ads precisa enxergar suas contas para ler as campanhas."
      >
        <Link href="/conectar" className={buttonVariants()}>
          Conectar conta da Meta
        </Link>
      </ComingSoon>
    );
  }
  if (!tree) {
    return (
      <p className="text-sm text-muted-foreground">
        Suas contas ainda não foram lidas. Abra <Link href="/conectar" className="text-primary underline">Conexão</Link> e clique em “Atualizar contas”.
      </p>
    );
  }
  return <SourcePicker tree={tree} />;
}
