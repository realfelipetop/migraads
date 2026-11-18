import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { PlanSummary } from "@/meta/migrations";
import { copySuffix, mapAd, mapAdset, mapCampaign, mapCreative, postIdOf, type CreateStatus, type Mappings, type Obj } from "./mapper";
import type { SnapshotData } from "./snapshot";
import type { Diagnosis } from "./precheck";

export interface PlanOptions {
  suffix: string;
  createStatus: CreateStatus;
  /** Modo multiplicar (Fase 7): N cópias de cada campanha. */
  copies?: number;
  /** Mapeamentos (Fase 6). */
  mappings?: Mappings;
}

/**
 * Monta o plano (simulação): roda o tradutor em tudo, sem chamar a Meta, junta os avisos
 * e grava um item por objeto a criar — um conjunto completo por cópia. É a base da tela de
 * Revisão e da retomada.
 */
export function buildPlan(
  migrationId: string,
  snapshots: { id: string; data: SnapshotData }[],
  opts: PlanOptions,
  diagnosis: Diagnosis,
): PlanSummary {
  const mappings = opts.mappings;
  const blockedPages = new Set(diagnosis.blockedPages);
  const copies = Math.max(1, opts.copies ?? 1);
  const warnings = new Map<string, number>();
  const note = (list: string[]) => list.forEach((w) => warnings.set(w, (warnings.get(w) ?? 0) + 1));
  const rows: (typeof schema.migrationItems.$inferInsert)[] = [];
  let manual = 0;

  for (let copy = 1; copy <= copies; copy++) {
    const suffix = copySuffix(opts.suffix, copies, copy);
    const first = copy === 1; // avisos são os mesmos em todas as cópias: conta uma vez
    for (const { id: snapshotId, data } of snapshots) {
      const c = data.campaign;
      const camp = mapCampaign(c, { suffix, status: opts.createStatus, mappings });
      if (first) note(camp.warnings);
      rows.push({ migrationId, snapshotId, level: "campaign", sourceId: String(c.id), copyIndex: copy, name: String(camp.payload.name) });

      for (const s of data.adsets) {
        if (first) note(mapAdset(s, c, { newCampaignId: "<nova>", status: opts.createStatus, mappings }).warnings);
        rows.push({ migrationId, snapshotId, level: "adset", sourceId: String(s.id), copyIndex: copy, name: String(s.name) });
      }
      for (const ad of data.ads) {
        const page = postIdOf(ad.creative as Obj)?.split("_")[0];
        const cr = page && blockedPages.has(page)
          ? { manual: `Você não tem permissão de anunciar pela página ${page}. Peça acesso de anunciante ou duplique no Gerenciador.` }
          : mapCreative(ad, { suffix: opts.suffix, mappings });
        const base = { migrationId, snapshotId, level: "ad" as const, sourceId: String(ad.id), copyIndex: copy, name: String(ad.name) };
        if ("manual" in cr) {
          if (first) manual++;
          rows.push({ ...base, status: "manual", error: cr.manual });
          continue;
        }
        if (first) {
          note(cr.warnings);
          note(mapAd(ad, { newAdsetId: "<novo>", creativeId: "<novo>", status: opts.createStatus, mappings }).warnings);
        }
        rows.push(base);
      }
    }
  }

  const db = getDb();
  db.transaction((tx) => {
    tx.delete(schema.migrationItems).where(eq(schema.migrationItems.migrationId, migrationId)).run();
    if (rows.length) tx.insert(schema.migrationItems).values(rows).run();
  });

  const perCopy = (level: string) => rows.filter((r) => r.level === level && r.copyIndex === 1).length;
  return {
    ...diagnosis,
    warnings: [...warnings].map(([text, count]) => ({ text, count })),
    items: { campaigns: perCopy("campaign"), adsets: perCopy("adset"), ads: perCopy("ad"), manual, copies },
  };
}
