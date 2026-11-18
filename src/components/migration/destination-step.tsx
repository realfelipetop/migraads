"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { AccountPicker } from "@/components/accounts/account-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormMessage } from "@/components/connect/form-message";
import { planMigrationAction } from "@/app/migracoes/actions";
import { copySuffix, MAX_COPIES } from "@/migration/mapper";
import type { AccountSummary, AccountTree } from "@/meta/accounts";

/** Passo 3: conta de destino + opções. "Revisar" lê a origem e confere o destino, sem criar nada. */
export function DestinationStep({ migrationId, tree, sourceId }: { migrationId: string; tree: AccountTree; sourceId: string }) {
  const [dest, setDest] = useState<AccountSummary>();
  const [suffix, setSuffix] = useState(" [MIGRA]");
  const [active, setActive] = useState(false);
  const [copies, setCopies] = useState(1);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <AccountPicker tree={tree} onSelect={(a) => (setDest(a), setError(undefined))} />

      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="suffix">Sufixo no nome da campanha</Label>
          <Input id="suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} maxLength={40} />
          <p className="text-xs text-muted-foreground">
            Para diferenciar a cópia da original. Use <code>{"{n}"}</code> para o número da cópia.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="copies">Cópias de cada campanha</Label>
          <Input
            id="copies"
            type="number"
            min={1}
            max={MAX_COPIES}
            value={copies}
            onChange={(e) => setCopies(Math.min(MAX_COPIES, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
          />
          <p className="text-xs text-muted-foreground">
            {copies > 1 ? (
              <>
                Escala horizontal: {copies} campanhas iguais. Ex.: “…{copySuffix(suffix, copies, 1)}”, “…{copySuffix(suffix, copies, 2)}”
              </>
            ) : (
              "1 = migração normal. Mais de 1 = escala horizontal (mesmos posts)."
            )}
          </p>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Como criar</span>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={(v) => setActive(Boolean(v))} aria-label="Criar já ativo" />
            {active ? "Criar já ATIVO (começa a gastar)" : "Criar PAUSADO (recomendado)"}
          </label>
          <p className="text-xs text-muted-foreground">Pausado: você revisa no Gerenciador e ativa quando quiser.</p>
        </div>
      </div>

      <FormMessage>{error}</FormMessage>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {dest ? (
            <>
              Destino: <strong className="text-foreground">{dest.name}</strong> ({dest.accountId})
            </>
          ) : (
            "Escolha a conta de destino acima."
          )}
        </p>
        <Button
          disabled={!dest || pending || dest.id === sourceId}
          onClick={() =>
            start(async () => {
              const r = await planMigrationAction(migrationId, dest!.id, suffix, active, copies);
              if (r.message) setError(r.message);
            })
          }
        >
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Lendo a origem e conferindo o destino…" : "Revisar migração"}
          {!pending && <ArrowRight data-icon="inline-end" />}
        </Button>
      </div>
      {dest?.id === sourceId && <FormMessage>O destino precisa ser diferente da origem.</FormMessage>}
    </div>
  );
}
