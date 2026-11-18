import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Graph } from "@/meta/graph";
import type { ResolvedCampaign } from "@/lib/selection";
import type { Obj } from "./mapper";
import { SNAP_AD_FIELDS, SNAP_ADSET_FIELDS, SNAP_CAMPAIGN_FIELDS } from "./fields";

/** Cópia completa do que foi selecionado. A migração usa isto, não a origem ao vivo. */
export interface SnapshotData {
  campaign: Obj;
  adsets: Obj[];
  ads: Obj[];
}

export async function takeSnapshots(
  graph: Pick<Graph, "get" | "getAll" | "version">,
  sourceAccountId: string,
  resolved: ResolvedCampaign[],
  opts: { origin?: "manual" | "backup"; everything?: boolean } = {},
): Promise<string[]> {
  const ids: string[] = [];
  for (const rc of resolved) {
    const adsetIds = new Set(rc.adsets.map((s) => s.id));
    const adIds = new Set(rc.adsets.flatMap((s) => s.ads.map((a) => a.id)));
    // Backup leva a campanha inteira (todos os conjuntos e anúncios), não só uma seleção.
    const keepAdset = (s: Obj) => opts.everything || adsetIds.has(String(s.id));
    const keepAd = (a: Obj) => opts.everything || adIds.has(String(a.id));

    const campaign = await graph.get<Obj>(rc.id, { fields: SNAP_CAMPAIGN_FIELDS }, "Campaign");
    const adsets = (await graph.getAll<Obj>(`${rc.id}/adsets`, { fields: SNAP_ADSET_FIELDS, limit: 100 }, "AdSet")).filter(keepAdset);
    const ads = (await graph.getAll<Obj>(`${rc.id}/ads`, { fields: SNAP_AD_FIELDS, limit: 50 }, "Ad")).filter(keepAd);

    const row = getDb()
      .insert(schema.snapshots)
      .values({
        sourceAccountId,
        campaignId: rc.id,
        campaignName: String(campaign.name),
        apiVersion: graph.version,
        origin: opts.origin ?? "manual",
        data: { campaign, adsets, ads } satisfies SnapshotData,
      })
      .returning({ id: schema.snapshots.id })
      .get();
    ids.push(row.id);
  }
  return ids;
}

export function loadSnapshots(ids: string[]): Map<string, SnapshotData> {
  if (!ids.length) return new Map();
  const rows = getDb().select().from(schema.snapshots).where(inArray(schema.snapshots.id, ids)).all();
  return new Map(rows.map((r) => [r.id, r.data as SnapshotData]));
}

/** Monta a árvore "o que vai ser migrado" a partir de snapshots (migrar a partir de um backup). */
export function resolvedFromSnapshots(snaps: SnapshotData[]): ResolvedCampaign[] {
  return snaps.map((s) => ({
    id: String(s.campaign.id),
    name: String(s.campaign.name),
    whole: true,
    skippedDisapproved: 0,
    adsets: s.adsets.map((a) => ({
      id: String(a.id),
      name: String(a.name),
      whole: true,
      ads: s.ads.filter((ad) => String(ad.adset_id) === String(a.id)).map((ad) => ({ id: String(ad.id), name: String(ad.name) })),
    })),
  }));
}
