import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ResolvedCampaign, Selection } from "@/lib/selection";
import type { Check, Diagnosis } from "@/migration/precheck";
import type { Mappings } from "@/migration/mapper";

export type MigrationStatus = (typeof schema.migrations.$inferSelect)["status"];
export type ItemRow = typeof schema.migrationItems.$inferSelect;

export interface MigrationOptions {
  selection: Selection;
  snapshotIds?: string[];
  suffix?: string;
  createStatus?: "PAUSED" | "ACTIVE";
  /** Modo multiplicar: quantas cópias de cada campanha (1 = migração normal). */
  copies?: number;
  /** Mapeamentos para o destino (outra BM, pixel, públicos, moeda). */
  mappings?: Mappings;
  /** Migração criada a partir de um backup (Fase 8): usa os snapshots salvos, sem ler a origem. */
  fromBackup?: string;
  /** Moeda/fuso da origem guardados no backup (caso a origem não possa mais ser lida). */
  sourceInfo?: { name?: string; currency: string; timezone: string };
}

export interface PlanSummary extends Partial<Omit<Diagnosis, "checks">> {
  checks: Check[];
  warnings: { text: string; count: number }[];
  /** Contagens POR CÓPIA. Total criado = contagem × copies. */
  items: { campaigns: number; adsets: number; ads: number; manual: number; copies?: number };
}

export interface RunSummary {
  message?: string;
  waitingUntil?: string;
}

export interface MigrationView {
  id: string;
  status: MigrationStatus;
  sourceAccountId: string;
  destAccountId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  options: MigrationOptions;
  selection: Selection;
  resolved: ResolvedCampaign[];
  counts: { campaigns: number; adsets: number; ads: number; skippedDisapproved: number };
  plan?: PlanSummary;
  run?: RunSummary;
}

interface StoredSummary {
  resolved?: ResolvedCampaign[];
  counts?: MigrationView["counts"];
  plan?: PlanSummary;
  run?: RunSummary;
}

function toView(row: typeof schema.migrations.$inferSelect): MigrationView {
  const options = (row.options ?? {}) as Partial<MigrationOptions>;
  const summary = (row.summary ?? {}) as StoredSummary;
  const selection = options.selection ?? { campaigns: [], adsets: [], ads: [], excluded: [] };
  return {
    id: row.id,
    status: row.status,
    sourceAccountId: row.sourceAccountId,
    destAccountId: row.destAccountId,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    options: { ...options, selection },
    selection,
    resolved: summary.resolved ?? [],
    counts: summary.counts ?? { campaigns: 0, adsets: 0, ads: 0, skippedDisapproved: 0 },
    plan: summary.plan,
    run: summary.run,
  };
}

export function getMigration(id: string): MigrationView | null {
  const row = getDb().select().from(schema.migrations).where(eq(schema.migrations.id, id)).get();
  return row ? toView(row) : null;
}

export function listMigrations(limit = 50): MigrationView[] {
  return getDb().select().from(schema.migrations).orderBy(desc(schema.migrations.createdAt)).limit(limit).all().map(toView);
}

export function getItems(migrationId: string): ItemRow[] {
  return getDb()
    .select()
    .from(schema.migrationItems)
    .where(eq(schema.migrationItems.migrationId, migrationId))
    .orderBy(asc(schema.migrationItems.updatedAt))
    .all();
}

export function updateMigration(
  id: string,
  patch: Partial<Pick<typeof schema.migrations.$inferInsert, "status" | "destAccountId" | "startedAt" | "finishedAt" | "options">> & {
    summaryPatch?: Partial<StoredSummary>;
  },
) {
  const db = getDb();
  const { summaryPatch, ...rest } = patch;
  const set: Partial<typeof schema.migrations.$inferInsert> = { ...rest };
  if (summaryPatch) {
    const current = (db.select().from(schema.migrations).where(eq(schema.migrations.id, id)).get()?.summary ?? {}) as StoredSummary;
    set.summary = { ...current, ...summaryPatch };
  }
  db.update(schema.migrations).set(set).where(eq(schema.migrations.id, id)).run();
}

export function deleteMigration(id: string) {
  getDb().delete(schema.migrations).where(eq(schema.migrations.id, id)).run();
}

export const MIGRATION_STATUS: Record<MigrationStatus, string> = {
  draft: "Rascunho",
  planned: "Pronta para migrar",
  running: "Migrando",
  paused: "Pausada",
  done: "Concluída",
  done_with_issues: "Concluída com avisos",
  failed: "Falhou",
};

/** Links diretos para o Gerenciador de Anúncios. */
export const adsManagerUrl = {
  campaign: (act: string, id: string) =>
    `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act.replace("act_", "")}&selected_campaign_ids=${id}`,
  ad: (act: string, id: string) =>
    `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${act.replace("act_", "")}&selected_ad_ids=${id}`,
};
