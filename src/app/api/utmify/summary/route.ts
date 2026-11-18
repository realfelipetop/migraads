import { fetchSummary, getUtmifyConfig, periodRange, UtmifyError } from "@/integrations/utmify";
import { isPeriod } from "@/meta/metrics";

/** GET /api/utmify/summary?account=act_123&period=last_30d — resultado real da conta na Utmify. */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const cfg = getUtmifyConfig();
  if (!cfg) return Response.json({ configured: false });
  const account = sp.get("account") ?? "";
  if (!/^act_\d+$/.test(account)) return Response.json({ error: "Conta inválida." }, { status: 400 });
  const period = sp.get("period");
  try {
    const summary = await fetchSummary(cfg, { ...periodRange(isPeriod(period) ? period : "last_30d"), metaAdAccountIds: [account] });
    return Response.json({ configured: true, summary });
  } catch (e) {
    return Response.json({ configured: true, error: e instanceof UtmifyError ? e.message : "Erro ao consultar a Utmify." }, { status: 502 });
  }
}
