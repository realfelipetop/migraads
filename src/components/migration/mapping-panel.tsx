"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/connect/form-message";
import { saveMappingsAction } from "@/app/migracoes/actions";
import type { Mappings } from "@/migration/mapper";
import type { AssetNeed, Diagnosis } from "@/migration/precheck";

const KIND_LABEL: Record<string, string> = {
  pixel: "Pixel",
  custom_conversion: "Conversão personalizada",
  audience: "Público",
  instagram: "Conta do Instagram",
};
const REMOVE = "__remove__";

type Table = Record<string, string>;

/** Mapeamento (PLANO §11, tela 7): troca ativos da origem pelos equivalentes no destino. */
export function MappingPanel({
  migrationId,
  needs,
  candidates,
  currency,
  initial,
}: {
  migrationId: string;
  needs: AssetNeed[];
  candidates: Diagnosis["candidates"];
  currency: Diagnosis["currency"];
  initial?: Mappings;
}) {
  const [tables, setTables] = useState<Record<string, Table>>({
    pixel: { ...initial?.pixel },
    custom_conversion: { ...initial?.custom_conversion },
    audience: { ...initial?.audience },
    instagram: { ...initial?.instagram },
  });
  const [rate, setRate] = useState(initial?.currency?.rate ? String(initial.currency.rate) : "");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const mappable = needs.filter((n) => n.kind !== "page" && (n.kind === "instagram" ? candidates.instagram.length > 0 : true));
  const required = mappable.filter((n) => !n.available && n.kind !== "instagram");
  const optional = mappable.filter((n) => n.available && n.kind !== "instagram");
  const instagram = mappable.filter((n) => n.kind === "instagram");
  const needsCurrency = currency.source && currency.source !== currency.dest;

  const set = (kind: string, id: string, value: string) =>
    setTables((t) => {
      const next = { ...t[kind] };
      if (value) next[id] = value;
      else delete next[id];
      return { ...t, [kind]: next };
    });

  const row = (n: AssetNeed) => {
    const options = candidates[n.kind as keyof Diagnosis["candidates"]] ?? [];
    return (
      <li key={`${n.kind}-${n.id}`} className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <span className="min-w-0 text-sm">
          <span className="text-muted-foreground">{KIND_LABEL[n.kind]}:</span> <strong className="font-medium">{n.name ?? n.id}</strong>
          <span className="text-xs text-muted-foreground">
            {" "}
            · usado em {n.usedBy} {n.available ? "· já disponível no destino" : "· não existe no destino"}
          </span>
        </span>
        <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
        <select
          value={tables[n.kind]?.[n.id] ?? ""}
          onChange={(e) => set(n.kind, n.id, e.target.value)}
          aria-label={`Trocar ${KIND_LABEL[n.kind]} ${n.name ?? n.id}`}
          className="h-8 w-full min-w-0 rounded-lg border border-input bg-card px-2 text-sm"
        >
          <option value="">{n.available ? "Manter o mesmo" : options.length ? "Escolha…" : "Nenhuma opção no destino"}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.id})
            </option>
          ))}
          {n.kind === "audience" && <option value={REMOVE}>Remover do conjunto</option>}
        </select>
      </li>
    );
  };

  if (!required.length && !needsCurrency && !instagram.length && !optional.length) return null;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="font-semibold">Mapeamento para o destino</h3>
        <p className="text-sm text-muted-foreground">
          Troque o que o destino não enxerga pelos equivalentes de lá. Fica salvo para as próximas migrações para esta conta.
        </p>
      </div>

      {required.length > 0 && <ul className="space-y-3">{required.map(row)}</ul>}

      {needsCurrency && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Moeda diferente: <strong>1 {currency.source}</strong> =
          </span>
          <Input
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(",", "."))}
            inputMode="decimal"
            placeholder="0,18"
            className="w-28"
            aria-label={`Valor de 1 ${currency.source} em ${currency.dest}`}
          />
          <strong>{currency.dest}</strong>
          {Number(rate) > 0 && (
            <span className="text-muted-foreground">
              (ex.: 100 {currency.source} → {(100 * Number(rate)).toFixed(2)} {currency.dest} de orçamento)
            </span>
          )}
        </div>
      )}

      {(optional.length > 0 || instagram.length > 0) && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Trocar outros ativos (opcional)</summary>
          <ul className="mt-3 space-y-3">{[...optional, ...instagram].map(row)}</ul>
        </details>
      )}

      <FormMessage>{error}</FormMessage>
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await saveMappingsAction(migrationId, { ...tables, currency: rate ? { rate: Number(rate) } : undefined });
            setError(r.message);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        {pending ? "Conferindo de novo…" : "Salvar mapeamento e conferir"}
      </Button>
    </div>
  );
}
