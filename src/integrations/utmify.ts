import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Period } from "@/meta/metrics";

/**
 * Integração opcional com a Utmify (Fase 9), pela API oficial de consulta:
 * https://docs.utmify.com.br/consulta-de-dados
 *
 * Limites da API (nov/2026): só o RESUMO do dashboard (filtrável por conta de anúncios), sem
 * métricas por campanha; planos Monster/Scale/Enterprise; beta fechado; 10 req/min.
 */

const BASE = "https://query-api.utmify.com.br/public-api/v1";
const KEY = "utmify";

export interface UtmifyConfig {
  apiKey: string;
  dashboardId: string;
}

export function getUtmifyConfig(): UtmifyConfig | null {
  const row = getDb().select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  const v = row?.value as { apiKeyEncrypted?: string; dashboardId?: string } | undefined;
  if (!v?.apiKeyEncrypted || !v.dashboardId) return null;
  return { apiKey: decrypt(v.apiKeyEncrypted), dashboardId: v.dashboardId };
}

export function saveUtmifyConfig(cfg: UtmifyConfig) {
  const value = { apiKeyEncrypted: encrypt(cfg.apiKey), dashboardId: cfg.dashboardId };
  getDb()
    .insert(schema.settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}

export function removeUtmifyConfig() {
  getDb().delete(schema.settings).where(eq(schema.settings.key, KEY)).run();
}

export interface UtmifySummary {
  currency: string;
  orders: { total: number; approved: number; pending: number; refunded: number };
  revenue: { gross: number; net: number };
  ads: { spend: number };
  result: { profit: number | null; roas: number | null; roi: number | null; cpa: number | null; profitMargin: number | null };
}

const MESSAGES: Record<string, string> = {
  INVALID_DASHBOARD_ID: "O ID do dashboard não é válido. Copie de novo na Utmify.",
  OFFICIAL_API_NOT_AVAILABLE_FOR_USER: "A API oficial da Utmify ainda está em beta fechado e não foi liberada para a sua conta.",
  OFFICIAL_API_REQUIRES_ELIGIBLE_PLAN: "A API oficial da Utmify só funciona nos planos Monster, Scale ou Enterprise.",
  API_KEY_HAS_NO_ACCESS_TO_DASHBOARD: "Essa chave não tem acesso a esse dashboard. Confira o escopo do token na Utmify.",
  DASHBOARD_MISCONFIGURED: "A Utmify não conseguiu calcular esse dashboard (configuração do dashboard).",
  RATE_LIMIT_EXCEEDED: "Muitas consultas à Utmify em sequência. Espere um minuto.",
  DAILY_QUOTA_EXCEEDED: "Limite diário de consultas da Utmify atingido. Tente amanhã.",
};

export class UtmifyError extends Error {}

/** POST .../dashboards/{id}/summary. Dinheiro vem em centavos. */
export async function fetchSummary(
  cfg: UtmifyConfig,
  body: { from?: string; to?: string; metaAdAccountIds?: string[] },
  fetchImpl: typeof fetch = fetch,
): Promise<UtmifySummary> {
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}/dashboards/${encodeURIComponent(cfg.dashboardId)}/summary`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new UtmifyError("Sem conexão com a Utmify.");
  }
  if (res.status === 401) throw new UtmifyError("A Utmify recusou a chave (inválida ou desativada).");
  const json = (await res.json().catch(() => ({}))) as { reason?: string } & Partial<UtmifySummary>;
  if (!res.ok) throw new UtmifyError(MESSAGES[json.reason ?? ""] ?? `A Utmify respondeu ${res.status}${json.reason ? ` (${json.reason})` : ""}.`);
  return json as UtmifySummary;
}

/** Período do Explorador → intervalo da Utmify, no fuso deste computador (mesma regra da Meta: 7/30 dias sem hoje). */
export function periodRange(period: Period, now = new Date()): { from?: string; to?: string } {
  if (period === "maximum") return {};
  const day = (d: Date, end = false) => {
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? "+" : "-";
    const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
    const mm = String(Math.abs(off) % 60).padStart(2, "0");
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}T${end ? "23:59:59" : "00:00:00"}${sign}${hh}:${mm}`;
  };
  const shift = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  switch (period) {
    case "today":
      return { from: day(now), to: day(now, true) };
    case "yesterday":
      return { from: day(shift(-1)), to: day(shift(-1), true) };
    case "last_7d":
      return { from: day(shift(-7)), to: day(shift(-1), true) };
    case "last_30d":
      return { from: day(shift(-30)), to: day(shift(-1), true) };
    case "this_month":
      return { from: day(new Date(now.getFullYear(), now.getMonth(), 1)), to: day(now, true) };
    case "last_month":
      return {
        from: day(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: day(new Date(now.getFullYear(), now.getMonth(), 0), true),
      };
  }
}
