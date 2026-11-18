import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowLeftRight, Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Explorer } from "@/components/explorer/explorer";
import { findAccount, getAccountTree } from "@/meta/accounts";
import { getConnectionStatus } from "@/meta/store";
import { restrictionNotice } from "@/migration/precheck";

export const metadata: Metadata = { title: "Escolher o que migrar" };

export default function ExplorerPage({ params }: PageProps<"/migrar/[account]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full rounded-xl" />}>
      <ExplorerForAccount params={params} />
    </Suspense>
  );
}

async function ExplorerForAccount({ params }: { params: PageProps<"/migrar/[account]">["params"] }) {
  await connection();
  const { account: id } = await params;
  const status = getConnectionStatus();
  const account = findAccount(getAccountTree(), id);

  if (status.state !== "ok" && status.state !== "expiring") {
    return (
      <p className="text-sm">
        Conecte sua conta da Meta primeiro: <Link href="/conectar" className="text-primary underline">Conexão</Link>.
      </p>
    );
  }
  if (!account) {
    return (
      <p className="text-sm">
        Conta não encontrada entre as suas. <Link href="/migrar" className="text-primary underline">Escolher outra conta</Link> ou
        atualize as contas em <Link href="/conectar" className="text-primary underline">Conexão</Link>.
      </p>
    );
  }

  return (
    <>
      <PageHeader
        title={account.name}
        description={
          <>
            Passo 2 de 4: marque as campanhas, conjuntos e anúncios que você quer levar. Conta {account.accountId} ·{" "}
            {account.statusLabel} · {account.currency}
          </>
        }
        actions={
          <Link href="/migrar" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeftRight /> Trocar conta
          </Link>
        }
      />
      {!account.active && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Esta conta está <strong>{account.statusLabel.toLowerCase()}</strong>. Dá para ler e migrar as campanhas dela normalmente.{" "}
            {restrictionNotice(account.status)}
          </span>
        </p>
      )}
      <Explorer account={account} />
    </>
  );
}
