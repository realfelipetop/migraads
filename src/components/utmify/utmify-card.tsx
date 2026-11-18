"use client";

import { useQuery } from "@tanstack/react-query";
import { formatMoney, formatNumber, PERIODS, type Period } from "@/meta/metrics";
import type { UtmifySummary } from "@/integrations/utmify";

type Resp = { configured: boolean; summary?: UtmifySummary; error?: string };

/** Resultado real da conta na Utmify (resumo; a API não traz por campanha). Só aparece se a Utmify estiver conectada. */
export function UtmifyCard({ account, period }: { account: string; period: Period }) {
  const q = useQuery({
    queryKey: ["utmify", account, period],
    queryFn: async () => (await fetch(`/api/utmify/summary?account=${account}&period=${period}`)).json() as Promise<Resp>,
    staleTime: 2 * 60_000, // a Utmify guarda cache de ~2 min
  });
  if (!q.data?.configured) return null;
  const label = PERIODS.find((p) => p.value === period)?.label.toLowerCase();
  if (q.data.error) {
    return <p className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-sm">Utmify: {q.data.error}</p>;
  }
  const s = q.data.summary;
  if (!s) return null;
  const money = (cents: number | null | undefined) => formatMoney(cents === null || cents === undefined ? null : cents / 100, s.currency);
  const items: [string, string][] = [
    ["Faturamento", money(s.revenue.net)],
    ["Gasto", money(s.ads.spend)],
    ["Lucro", money(s.result.profit)],
    ["ROAS", s.result.roas === null ? "—" : formatNumber(s.result.roas, 2)],
    ["CPA", money(s.result.cpa)],
    ["Vendas aprovadas", formatNumber(s.orders.approved)],
  ];
  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">Resultado real na Utmify · conta inteira · {label}</p>
      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className={k === "Lucro" && (s.result.profit ?? 0) < 0 ? "font-semibold text-destructive" : "font-semibold"}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
