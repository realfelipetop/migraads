import { computeMetrics, type InsightRow, type Metrics, type Period } from "./metrics";
import type { Graph, Params } from "./graph";

/**
 * Dados do Explorador (Fase 3): campanhas, conjuntos e anúncios de uma conta, com métricas do período.
 * Só leitura. Roda no servidor; o navegador recebe só estas linhas (nunca o token).
 */

export type Level = "campaign" | "adset" | "ad";
export type StatusFilter = "active" | "all";

export interface ExplorerRow {
  id: string;
  level: Level;
  name: string;
  status: string; // effective_status
  campaignId: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  objective?: string;
  dailyBudget?: string | null;
  lifetimeBudget?: string | null;
  bidStrategy?: string | null;
  bidAmount?: string | null;
  optimizationGoal?: string | null;
  thumbnail?: string | null;
  /** O anúncio aponta para um post (pode ser reaproveitado no destino). */
  hasPost?: boolean;
  metrics: Metrics;
}

export interface ExplorerResult {
  rows: ExplorerRow[];
  truncated: boolean;
  /** Métricas falharam (ex.: conta sem permissão de insights). As linhas vêm sem números. */
  metricsError?: string;
}

/** Limite por consulta. Acima disso, o usuário filtra por campanha (como no Gerenciador). */
export const MAX_ROWS = 500;

interface Query {
  account: string; // act_123
  level: Level;
  period: Period;
  status: StatusFilter;
  campaignIds?: string[];
  adsetIds?: string[];
}

const FIELDS: Record<Level, string> = {
  campaign: "id,name,effective_status,objective,daily_budget,lifetime_budget,bid_strategy",
  adset:
    "id,name,effective_status,campaign_id,campaign{name,objective},daily_budget,lifetime_budget,bid_amount,bid_strategy,optimization_goal",
  ad: "id,name,effective_status,campaign_id,adset_id,campaign{name,objective},adset{name},creative{thumbnail_url,image_url,object_story_id,effective_object_story_id}",
};

const EDGE: Record<Level, string> = { campaign: "campaigns", adset: "adsets", ad: "ads" };

function filtering(q: Query) {
  const f: { field: string; operator: string; value: string[] }[] = [];
  if (q.adsetIds?.length) f.push({ field: "adset.id", operator: "IN", value: q.adsetIds });
  else if (q.campaignIds?.length) f.push({ field: "campaign.id", operator: "IN", value: q.campaignIds });
  return f;
}

export async function loadLevel(graph: Graph, q: Query): Promise<ExplorerResult> {
  const params: Params = { fields: FIELDS[q.level], limit: 100 };
  const f = filtering(q);
  if (f.length) params.filtering = f;
  if (q.status === "active") params.effective_status = ["ACTIVE"];

  type Raw = Record<string, unknown> & {
    id: string;
    name: string;
    effective_status: string;
    campaign_id?: string;
    adset_id?: string;
    campaign?: { name?: string; objective?: string };
    adset?: { name?: string };
    creative?: { thumbnail_url?: string; image_url?: string; object_story_id?: string; effective_object_story_id?: string };
  };
  const raw = await graph.getAll<Raw>(`${q.account}/${EDGE[q.level]}`, params, q.level, MAX_ROWS);

  // Métricas do período, num pedido só para o nível inteiro.
  let insights = new Map<string, InsightRow>();
  let metricsError: string | undefined;
  try {
    const iParams: Params = {
      level: q.level,
      date_preset: q.period,
      fields: `${q.level}_id,spend,impressions,reach,actions,action_values,purchase_roas`,
      limit: 500,
    };
    if (f.length) iParams.filtering = f;
    const rows = await graph.getAll<InsightRow>(`${q.account}/insights`, iParams, "insights");
    insights = new Map(rows.map((r) => [String(r[`${q.level}_id` as keyof InsightRow]), r]));
  } catch (e) {
    metricsError = e instanceof Error ? e.message : String(e);
  }

  const rows: ExplorerRow[] = raw.map((r) => {
    const objective = (r.objective as string | undefined) ?? r.campaign?.objective;
    return {
      id: r.id,
      level: q.level,
      name: r.name,
      status: r.effective_status,
      campaignId: q.level === "campaign" ? r.id : (r.campaign_id ?? ""),
      campaignName: q.level === "campaign" ? r.name : r.campaign?.name,
      adsetId: q.level === "adset" ? r.id : r.adset_id,
      adsetName: q.level === "adset" ? r.name : r.adset?.name,
      objective,
      dailyBudget: (r.daily_budget as string | undefined) ?? null,
      lifetimeBudget: (r.lifetime_budget as string | undefined) ?? null,
      bidStrategy: (r.bid_strategy as string | undefined) ?? null,
      bidAmount: (r.bid_amount as string | number | undefined)?.toString() ?? null,
      optimizationGoal: (r.optimization_goal as string | undefined) ?? null,
      thumbnail: r.creative?.thumbnail_url ?? r.creative?.image_url ?? null,
      hasPost: q.level === "ad" ? Boolean(r.creative?.object_story_id ?? r.creative?.effective_object_story_id) : undefined,
      metrics: computeMetrics(insights.get(r.id), objective),
    };
  });

  // Mesma ordem do Gerenciador: o que está veiculando primeiro, depois quem gastou mais.
  rows.sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") || b.metrics.spend - a.metrics.spend);
  return { rows, truncated: Boolean(raw.truncated), metricsError };
}

/** Estrutura leve de uma campanha (para a seleção em cascata saber quem são os filhos). */
export interface CampaignStructure {
  campaign: { id: string; name: string; status: string; accountId?: string };
  adsets: { id: string; name: string; status: string }[];
  ads: { id: string; name: string; status: string; adsetId: string }[];
}

export async function loadStructure(graph: Graph, campaignId: string): Promise<CampaignStructure> {
  const [c, adsets, ads] = await Promise.all([
    graph.get<{ id: string; name: string; effective_status: string; account_id?: string }>(campaignId, { fields: "id,name,effective_status,account_id" }),
    graph.getAll<{ id: string; name: string; effective_status: string }>(`${campaignId}/adsets`, {
      fields: "id,name,effective_status",
      limit: 200,
    }),
    graph.getAll<{ id: string; name: string; effective_status: string; adset_id: string }>(`${campaignId}/ads`, {
      fields: "id,name,effective_status,adset_id",
      limit: 200,
    }),
  ]);
  return {
    campaign: { id: c.id, name: c.name, status: c.effective_status, accountId: c.account_id },
    adsets: adsets.map((s) => ({ id: s.id, name: s.name, status: s.effective_status })),
    ads: ads.map((a) => ({ id: a.id, name: a.name, status: a.effective_status, adsetId: a.adset_id })),
  };
}
