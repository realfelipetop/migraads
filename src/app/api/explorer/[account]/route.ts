import { loadLevel, loadStructure, type Level, type StatusFilter } from "@/meta/explorer";
import { friendlyError } from "@/meta/errors";
import { isPeriod } from "@/meta/metrics";
import { getGraph } from "@/meta/store";

const LEVELS: Level[] = ["campaign", "adset", "ad"];
const ids = (v: string | null) => (v ? v.split(",").filter((x) => /^\d+$/.test(x)) : undefined);

/**
 * GET /api/explorer/act_123?level=campaign|adset|ad&period=last_30d&status=all|active&campaigns=1,2&adsets=3
 * GET /api/explorer/act_123?structure=<campaignId>
 */
export async function GET(request: Request, ctx: RouteContext<"/api/explorer/[account]">) {
  const { account } = await ctx.params;
  if (!/^act_\d+$/.test(account)) return Response.json({ error: "Conta inválida." }, { status: 400 });
  const sp = new URL(request.url).searchParams;

  try {
    const graph = getGraph();
    const structure = sp.get("structure");
    if (structure) {
      if (!/^\d+$/.test(structure)) return Response.json({ error: "Campanha inválida." }, { status: 400 });
      return Response.json(await loadStructure(graph, structure));
    }

    const level = (sp.get("level") ?? "campaign") as Level;
    if (!LEVELS.includes(level)) return Response.json({ error: "Nível inválido." }, { status: 400 });
    const period = sp.get("period");
    const status = (sp.get("status") === "active" ? "active" : "all") as StatusFilter;

    const result = await loadLevel(graph, {
      account,
      level,
      period: isPeriod(period) ? period : "last_30d",
      status,
      campaignIds: ids(sp.get("campaigns")),
      adsetIds: ids(sp.get("adsets")),
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: friendlyError(e) }, { status: 502 });
  }
}
