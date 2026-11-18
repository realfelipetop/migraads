"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleAlert,
  Folder,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Search,
  Square,
  Trophy,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FormMessage } from "@/components/connect/form-message";
import { cn } from "@/lib/utils";
import type { AccountSummary } from "@/meta/accounts";
import type { CampaignStructure, ExplorerResult, ExplorerRow, Level, StatusFilter } from "@/meta/explorer";
import { DELIVERY_STATUS, PERIODS, formatMoney, formatNumber, fromMinor, type Period } from "@/meta/metrics";
import {
  adIncluded,
  adsetCheck,
  campaignCheck,
  campaignsInvolved,
  countSelection,
  emptySelection,
  resolveSelection,
  toggleAd,
  toggleAdset,
  toggleCampaign,
  type CheckState,
  type Selection,
} from "@/lib/selection";
import { saveDraftAction } from "@/app/migrar/actions";
import { RowCheck } from "./row-check";
import { UtmifyCard } from "@/components/utmify/utmify-card";

const TABS: { level: Level; label: string; icon: typeof Folder }[] = [
  { level: "campaign", label: "Campanhas", icon: Folder },
  { level: "adset", label: "Conjuntos de anúncios", icon: LayoutGrid },
  { level: "ad", label: "Anúncios", icon: Square },
];

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Erro ${res.status}`);
  return body as T;
}

export function Explorer({ account }: { account: AccountSummary }) {
  const [level, setLevel] = useState<Level>("campaign");
  const [period, setPeriod] = useState<Period>("last_30d");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [hideDisapproved, setHideDisapproved] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Selection>(emptySelection);
  /** Clique no nome: abre os filhos daquela campanha/conjunto (como no Gerenciador). */
  const [drill, setDrill] = useState<{ campaign?: ExplorerRow; adset?: ExplorerRow } | null>(null);
  const [saving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string>();
  const [minRoas, setMinRoas] = useState("1");

  // Pais conhecidos (das linhas já carregadas), para a cascata e o filtro das abas.
  const [parents, setParents] = useState<Record<string, { campaignId: string; adsetId?: string }>>({});
  const parentOf = (id: string) => parents[id]?.campaignId;

  const involved = campaignsInvolved(sel, parentOf);
  const structures = useQueries({
    queries: involved.map((c) => ({
      queryKey: ["structure", account.id, c],
      queryFn: () => getJson<CampaignStructure>(`/api/explorer/${account.id}?structure=${c}`),
      staleTime: 10 * 60_000,
    })),
  });
  const structureOf = (campaignId: string) =>
    structures[involved.indexOf(campaignId)]?.data as CampaignStructure | undefined;

  // Filtro das abas filhas: o "drill" tem prioridade; senão, o que estiver selecionado.
  const filter: { campaigns?: string[]; adsets?: string[] } = (() => {
    if (level === "campaign") return {};
    if (drill?.adset && level === "ad") return { adsets: [drill.adset.id] };
    if (drill?.campaign) return { campaigns: [drill.campaign.id] };
    const selAdsets = level === "ad" ? sel.adsets : [];
    if (selAdsets.length && !sel.campaigns.length) return { adsets: selAdsets };
    return involved.length ? { campaigns: involved } : {};
  })();

  const params = new URLSearchParams({ level, period, status });
  if (filter.campaigns) params.set("campaigns", filter.campaigns.join(","));
  if (filter.adsets) params.set("adsets", filter.adsets.join(","));
  const url = `/api/explorer/${account.id}?${params}`;

  const list = useQuery({ queryKey: ["explorer", url], queryFn: () => getJson<ExplorerResult>(url) });

  const rows = useMemo(() => {
    let r = list.data?.rows ?? [];
    if (hideDisapproved) r = r.filter((x) => x.status !== "DISAPPROVED");
    const q = query.trim().toLowerCase();
    if (q) r = r.filter((x) => x.name.toLowerCase().includes(q) || x.id.includes(q));
    return r;
  }, [list.data, hideDisapproved, query]);

  const checkOf = (row: ExplorerRow): CheckState => {
    if (row.level === "campaign") return campaignCheck(sel, row.id, structureOf(row.id));
    if (row.level === "adset") return adsetCheck(sel, row.id, row.campaignId, structureOf(row.campaignId));
    return adIncluded(sel, row, { campaignId: row.campaignId, adsetId: row.adsetId! }) ? "checked" : "unchecked";
  };

  const toggle = (row: ExplorerRow) => {
    setSaveError(undefined);
    setParents((p) => (row.level === "campaign" ? p : { ...p, [row.id]: { campaignId: row.campaignId, adsetId: row.adsetId } }));
    setSel((s) => {
      if (row.level === "campaign") return toggleCampaign(s, row.id, structureOf(row.id));
      if (row.level === "adset") return toggleAdset(s, row.id, { campaignId: row.campaignId }, structureOf(row.campaignId));
      return toggleAd(s, row, { campaignId: row.campaignId, adsetId: row.adsetId! });
    });
  };

  const allChecked = rows.length > 0 && rows.every((r) => checkOf(r) === "checked");
  const toggleAll = () => {
    for (const r of rows) if ((checkOf(r) === "checked") === allChecked) toggle(r);
  };

  /** Marca os itens visíveis com ROAS (da Meta) maior ou igual ao mínimo. Funciona com ou sem Utmify. */
  const winners = rows.filter((r) => r.metrics.roas !== null && r.metrics.roas >= (Number(minRoas.replace(",", ".")) || 0));
  const selectWinners = () => {
    for (const r of winners) if (checkOf(r) !== "checked") toggle(r);
  };

  const loadingStructures = structures.some((q) => q.isLoading);
  const loadedStructures = structures.map((q) => q.data).filter(Boolean) as CampaignStructure[];
  const counts = countSelection(resolveSelection(sel, loadedStructures));
  const hasSelection = sel.campaigns.length + sel.adsets.length + sel.ads.length > 0;

  const openChildren = (row: ExplorerRow) => {
    if (row.level === "campaign") {
      setDrill({ campaign: row });
      setLevel("adset");
    } else if (row.level === "adset") {
      setDrill((d) => ({ campaign: d?.campaign, adset: row }));
      setLevel("ad");
    }
  };

  const tabSuffix = (l: Level) => {
    if (l === "campaign") return "";
    if (drill?.adset && l === "ad") return " para 1 conjunto";
    if (drill?.campaign) return " para 1 campanha";
    return involved.length ? ` para ${involved.length} campanha${involved.length > 1 ? "s" : ""}` : "";
  };

  const totals = rows.reduce(
    (t, r) => ({ spend: t.spend + r.metrics.spend, results: t.results + (r.metrics.results ?? 0) }),
    { spend: 0, results: 0 },
  );

  return (
    <div className="pb-24">
      <UtmifyCard account={account.id} period={period} />
      {/* Abas */}
      <div className="flex flex-wrap items-end gap-1 border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.level}
            role="tab"
            aria-selected={level === t.level}
            onClick={() => setLevel(t.level)}
            className={cn(
              "-mb-px flex items-center gap-2 rounded-t-lg border border-b-0 px-3.5 py-2.5 text-sm font-medium transition-colors",
              level === t.level
                ? "border-border bg-card text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            <span className="hidden font-normal text-muted-foreground sm:inline">{tabSuffix(t.level)}</span>
          </button>
        ))}
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-b-xl border border-t-0 border-border bg-card p-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou ID"
            className="pl-8"
            aria-label="Buscar"
          />
        </div>
        <div className="flex rounded-lg border border-border p-0.5 text-sm" role="group" aria-label="Status">
          {(["all", "active"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={cn("rounded-md px-2.5 py-1", status === s ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground")}
            >
              {s === "all" ? "Todos" : "Só ativos"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={hideDisapproved} onCheckedChange={setHideDisapproved} aria-label="Esconder reprovados" />
          Esconder reprovados
        </label>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          aria-label="Período das métricas"
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-0.5 text-sm">
          <span className="text-muted-foreground">ROAS ≥</span>
          <input
            value={minRoas}
            onChange={(e) => setMinRoas(e.target.value)}
            inputMode="decimal"
            aria-label="ROAS mínimo para vencedores"
            className="w-10 bg-transparent text-center outline-none"
          />
          <Button variant="ghost" size="sm" onClick={selectWinners} disabled={!winners.length} title="Marca os itens visíveis com ROAS igual ou maior">
            <Trophy /> Selecionar vencedores{winners.length ? ` (${winners.length})` : ""}
          </Button>
        </div>
        <Button variant="outline" size="icon-sm" onClick={() => list.refetch()} aria-label="Atualizar" title="Atualizar">
          <RefreshCw className={cn(list.isFetching && "animate-spin")} />
        </Button>
      </div>

      {drill && level !== "campaign" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mostrando:</span>
          <Badge variant="secondary" className="gap-1">
            {drill.adset && level === "ad" ? drill.adset.name : drill.campaign?.name}
            <button onClick={() => setDrill(null)} aria-label="Limpar filtro">
              <X className="size-3" />
            </button>
          </Badge>
        </div>
      )}

      {list.data?.truncated && (
        <p className="mt-3 text-sm text-warning">
          A conta tem muitos itens: mostrando os primeiros 500. Marque campanhas para ver o resto.
        </p>
      )}
      {list.data?.metricsError && (
        <p className="mt-3 text-sm text-warning">Não deu para ler as métricas agora. A lista está completa, só sem os números.</p>
      )}

      {/* Tabela */}
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-10 px-3 py-2.5">
                <RowCheck state={allChecked ? "checked" : "unchecked"} onChange={toggleAll} label="Marcar todos" />
              </th>
              <th className="px-2 py-2.5 font-medium">{TABS.find((t) => t.level === level)!.label.replace(" de anúncios", "")}</th>
              <th className="px-2 py-2.5 font-medium">Veiculação</th>
              <th className="px-2 py-2.5 text-right font-medium">{level === "ad" ? "" : "Orçamento"}</th>
              <th className="px-2 py-2.5 text-right font-medium">Resultados</th>
              <th className="px-2 py-2.5 text-right font-medium">Custo por resultado</th>
              <th className="px-2 py-2.5 text-right font-medium">Valor gasto</th>
              <th className="px-3 py-2.5 text-right font-medium">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td colSpan={8} className="px-3 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
            {list.error && (
              <tr>
                <td colSpan={8} className="p-4">
                  <FormMessage>{(list.error as Error).message}</FormMessage>
                </td>
              </tr>
            )}
            {!list.isLoading && !list.error && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                  Nada encontrado com esses filtros.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <Row
                key={r.id}
                row={r}
                currency={account.currency}
                check={checkOf(r)}
                onToggle={() => toggle(r)}
                onOpen={() => openChildren(r)}
              />
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-border text-xs text-muted-foreground">
                <td />
                <td className="px-2 py-2.5" colSpan={3}>
                  Resultados de {rows.length} {TABS.find((t) => t.level === level)!.label.toLowerCase()}
                </td>
                <td className="px-2 py-2.5 text-right">{formatNumber(totals.results)}</td>
                <td />
                <td className="px-2 py-2.5 text-right font-medium text-foreground">{formatMoney(totals.spend, account.currency)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Barra de seleção */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 md:px-8">
          <div className="min-w-0 flex-1 text-sm">
            {!hasSelection ? (
              <span className="text-muted-foreground">Marque o que você quer migrar.</span>
            ) : loadingStructures ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Contando o que vai junto…
              </span>
            ) : (
              <span>
                <strong>{counts.campaigns}</strong> campanha{counts.campaigns !== 1 && "s"} ·{" "}
                <strong>{counts.adsets}</strong> conjunto{counts.adsets !== 1 && "s"} · <strong>{counts.ads}</strong> anúncio
                {counts.ads !== 1 && "s"}
                {counts.skippedDisapproved > 0 && (
                  <span className="text-muted-foreground"> ({counts.skippedDisapproved} reprovado(s) desmarcado(s))</span>
                )}
              </span>
            )}
            {saveError && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-destructive">
                <CircleAlert className="size-3.5" /> {saveError}
              </p>
            )}
          </div>
          {hasSelection && (
            <Button variant="ghost" size="sm" onClick={() => setSel(emptySelection())}>
              Limpar
            </Button>
          )}
          <Button
            disabled={!hasSelection || loadingStructures || saving || counts.ads + counts.adsets === 0}
            onClick={() =>
              startSaving(async () => {
                const r = await saveDraftAction(account.id, sel, involved);
                if (r?.message) setSaveError(r.message);
              })
            }
          >
            {saving && <Loader2 className="animate-spin" />}
            Continuar <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({
  row: r,
  currency,
  check,
  onToggle,
  onOpen,
}: {
  row: ExplorerRow;
  currency: string;
  check: CheckState;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const st = DELIVERY_STATUS[r.status] ?? { label: r.status, tone: "off" as const };
  const budget = r.dailyBudget
    ? `${formatMoney(fromMinor(r.dailyBudget, currency), currency)}/dia`
    : r.lifetimeBudget
      ? `${formatMoney(fromMinor(r.lifetimeBudget, currency), currency)} total`
      : r.level === "adset"
        ? "Da campanha"
        : r.level === "campaign"
          ? "Nos conjuntos"
          : "";
  const m = r.metrics;
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors last:border-0 hover:bg-muted/50",
        check !== "unchecked" && "bg-primary-soft/50",
      )}
    >
      <td className="px-3 py-2.5 align-top">
        <RowCheck state={check} onChange={onToggle} label={`Marcar ${r.name}`} />
      </td>
      <td className="max-w-[22rem] px-2 py-2 align-top">
        <div className="flex items-start gap-2.5">
          {r.level === "ad" &&
            (r.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element -- miniatura vinda do CDN da Meta
              <img src={r.thumbnail} alt="" className="size-10 shrink-0 rounded object-cover ring-1 ring-border" loading="lazy" />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                <ImageIcon className="size-4 text-muted-foreground" />
              </span>
            ))}
          <div className="min-w-0">
            {r.level === "ad" ? (
              <span className="block truncate font-medium">{r.name}</span>
            ) : (
              <button onClick={onOpen} className="block max-w-full truncate text-left font-medium text-primary hover:underline">
                {r.name}
              </button>
            )}
            <span className="block truncate text-xs text-muted-foreground">
              {r.level === "campaign" && (r.bidStrategy === "LOWEST_COST_WITH_BID_CAP" ? "Bid cap" : r.objective?.replace("OUTCOME_", "") ?? "")}
              {r.level === "adset" && r.campaignName}
              {r.level === "ad" && [r.campaignName, r.adsetName].filter(Boolean).join(" › ")}
            </span>
            {r.level === "ad" && r.status === "DISAPPROVED" && (
              <span className="text-xs text-destructive">Reprovado: desmarcado por padrão</span>
            )}
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5 align-top whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "size-2 rounded-full",
              st.tone === "active" ? "bg-success" : st.tone === "bad" ? "bg-destructive" : st.tone === "warn" ? "bg-warning" : "bg-muted-foreground/40",
            )}
          />
          {st.label}
        </span>
      </td>
      <td className="px-2 py-2.5 text-right align-top whitespace-nowrap">
        {budget}
        {r.level === "adset" && r.bidAmount && (
          <span className="block text-xs text-muted-foreground">Lance {formatMoney(fromMinor(r.bidAmount, currency), currency)}</span>
        )}
      </td>
      <td className="px-2 py-2.5 text-right align-top whitespace-nowrap">
        {m.results !== null ? (
          <>
            {formatNumber(m.results)}
            <span className="block text-xs text-muted-foreground">{m.resultLabel}</span>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="px-2 py-2.5 text-right align-top whitespace-nowrap">{formatMoney(m.costPerResult, currency)}</td>
      <td className="px-2 py-2.5 text-right align-top whitespace-nowrap">{formatMoney(m.spend, currency)}</td>
      <td className="px-3 py-2.5 text-right align-top whitespace-nowrap">{m.roas !== null ? formatNumber(m.roas, 2) : "—"}</td>
    </tr>
  );
}
