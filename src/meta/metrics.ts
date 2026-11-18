/**
 * Métricas no formato do Gerenciador. Funções puras: rodam no servidor e no navegador.
 */

export interface ActionStat {
  action_type: string;
  value: string;
}

export interface InsightRow {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  actions?: ActionStat[];
  action_values?: ActionStat[];
  purchase_roas?: ActionStat[];
}

export interface Metrics {
  spend: number;
  impressions: number;
  reach: number;
  results: number | null;
  resultLabel: string | null;
  costPerResult: number | null;
  roas: number | null;
}

/** Ordem de preferência por tipo de resultado (o primeiro que existir vale). */
const RESULT_TYPES: { label: string; types: string[] }[] = [
  { label: "Compras", types: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"] },
  { label: "Leads", types: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"] },
  { label: "Conversas", types: ["onsite_conversion.messaging_conversation_started_7d"] },
  { label: "Cliques no link", types: ["link_click"] },
];

/** Objetivo da campanha → qual resultado mostrar primeiro. */
const OBJECTIVE_FIRST: Record<string, string> = {
  OUTCOME_SALES: "Compras",
  OUTCOME_LEADS: "Leads",
  OUTCOME_ENGAGEMENT: "Conversas",
  OUTCOME_TRAFFIC: "Cliques no link",
};

const num = (v?: string) => (v === undefined || v === "" ? 0 : Number(v));

function pick(list: ActionStat[] | undefined, types: string[]): number | null {
  if (!list) return null;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return Number(hit.value);
  }
  return null;
}

export function computeMetrics(row: InsightRow | undefined, objective?: string): Metrics {
  const spend = num(row?.spend);
  const base = { spend, impressions: num(row?.impressions), reach: num(row?.reach) };
  if (!row) return { ...base, results: null, resultLabel: null, costPerResult: null, roas: null };

  const preferred = objective ? OBJECTIVE_FIRST[objective] : undefined;
  const ordered = preferred ? [...RESULT_TYPES].sort((a) => (a.label === preferred ? -1 : 0)) : RESULT_TYPES;
  let results: number | null = null;
  let resultLabel: string | null = null;
  for (const r of ordered) {
    const v = pick(row.actions, r.types);
    if (v !== null) {
      results = v;
      resultLabel = r.label;
      break;
    }
  }

  const purchaseTypes = RESULT_TYPES[0].types;
  let roas = pick(row.purchase_roas, purchaseTypes);
  if (roas === null && spend > 0) {
    const value = pick(row.action_values, purchaseTypes);
    roas = value === null ? null : value / spend;
  }

  return {
    ...base,
    results,
    resultLabel,
    costPerResult: results && results > 0 ? spend / results : null,
    roas,
  };
}

/** Moedas sem centavos na API da Meta (orçamentos vêm na unidade, não em centavos). */
const ZERO_DECIMAL = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);

/** Orçamento/lance da API (em centavos) → valor na moeda. */
export function fromMinor(value: string | number | null | undefined, currency: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  return Number(value) / (ZERO_DECIMAL.has(currency) ? 1 : 100);
}

export function formatMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

/** effective_status da Meta → texto curto em português. */
export const DELIVERY_STATUS: Record<string, { label: string; tone: "active" | "off" | "warn" | "bad" }> = {
  ACTIVE: { label: "Ativa", tone: "active" },
  PAUSED: { label: "Desativada", tone: "off" },
  CAMPAIGN_PAUSED: { label: "Campanha desativada", tone: "off" },
  ADSET_PAUSED: { label: "Conjunto desativado", tone: "off" },
  ARCHIVED: { label: "Arquivada", tone: "off" },
  DELETED: { label: "Excluída", tone: "off" },
  DISAPPROVED: { label: "Reprovado", tone: "bad" },
  WITH_ISSUES: { label: "Com problemas", tone: "bad" },
  PENDING_REVIEW: { label: "Em análise", tone: "warn" },
  IN_PROCESS: { label: "Em processamento", tone: "warn" },
  PREAPPROVED: { label: "Pré-aprovado", tone: "warn" },
  PENDING_BILLING_INFO: { label: "Falta pagamento", tone: "warn" },
};

export const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last_7d", label: "Últimos 7 dias" },
  { value: "last_30d", label: "Últimos 30 dias" },
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "maximum", label: "Máximo" },
] as const;

export type Period = (typeof PERIODS)[number]["value"];
export const isPeriod = (v: string | null | undefined): v is Period => PERIODS.some((p) => p.value === v);
