/**
 * Banco local do Migra Ads (PLANO §13). Um arquivo SQLite em data/migra-ads.db.
 *
 * Depois de alterar este arquivo, gere a migração com:  npm run db:generate
 */
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
const updatedAt = () =>
  text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
    .$onUpdateFn(() => new Date().toISOString());

/** Preferências gerais (chave → valor JSON). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }),
  updatedAt: updatedAt(),
});

/** Conexão com a Meta. O token fica criptografado (AES-256-GCM). */
export const connections = sqliteTable("connections", {
  id: id(),
  kind: text("kind", { enum: ["user", "system_user"] }).notNull(),
  appId: text("app_id").notNull(),
  metaUserId: text("meta_user_id"),
  metaUserName: text("meta_user_name"),
  tokenEncrypted: text("token_encrypted").notNull(),
  tokenExpiresAt: text("token_expires_at"),
  scopes: text("scopes", { mode: "json" }).$type<string[]>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Cache de contas de anúncios, para as telas abrirem rápido. */
export const accountsCache = sqliteTable(
  "accounts_cache",
  {
    id: text("id").primaryKey(), // act_123
    accountId: text("account_id").notNull(),
    name: text("name").notNull(),
    status: integer("status").notNull(),
    currency: text("currency").notNull(),
    timezone: text("timezone").notNull(),
    businessId: text("business_id"),
    businessName: text("business_name"),
    kind: text("kind", { enum: ["personal", "owned", "client"] }).notNull(),
    raw: text("raw", { mode: "json" }),
    fetchedAt: createdAt(),
  },
  (t) => [index("accounts_cache_business_idx").on(t.businessId)],
);

/** Cópia completa da estrutura lida da origem. A migração usa o snapshot, não a origem ao vivo. */
export const snapshots = sqliteTable(
  "snapshots",
  {
    id: id(),
    sourceAccountId: text("source_account_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    campaignName: text("campaign_name").notNull(),
    apiVersion: text("api_version").notNull(),
    origin: text("origin", { enum: ["manual", "backup"] }).notNull().default("manual"),
    data: text("data", { mode: "json" }).notNull(),
    takenAt: createdAt(),
  },
  (t) => [index("snapshots_account_idx").on(t.sourceAccountId, t.campaignId)],
);

export const migrations = sqliteTable("migrations", {
  id: id(),
  status: text("status", {
    enum: ["draft", "planned", "running", "paused", "done", "done_with_issues", "failed"],
  })
    .notNull()
    .default("draft"),
  sourceAccountId: text("source_account_id").notNull(),
  destAccountId: text("dest_account_id"),
  options: text("options", { mode: "json" }), // pausado/ativo, cópias, sufixo, metadados…
  summary: text("summary", { mode: "json" }),
  createdAt: createdAt(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

/** Cada objeto a criar numa migração. É o que permite mostrar progresso e retomar. */
export const migrationItems = sqliteTable(
  "migration_items",
  {
    id: id(),
    migrationId: text("migration_id")
      .notNull()
      .references(() => migrations.id, { onDelete: "cascade" }),
    snapshotId: text("snapshot_id").references(() => snapshots.id),
    level: text("level", { enum: ["campaign", "adset", "media", "creative", "ad"] }).notNull(),
    sourceId: text("source_id").notNull(),
    copyIndex: integer("copy_index").notNull().default(1),
    name: text("name"),
    status: text("status", { enum: ["pending", "done", "failed", "skipped", "manual"] })
      .notNull()
      .default("pending"),
    destId: text("dest_id"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    warnings: text("warnings", { mode: "json" }).$type<string[]>(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("migration_items_unique").on(t.migrationId, t.level, t.sourceId, t.copyIndex)],
);

/**
 * Origem → destino, por migração e conta de destino. Antes de criar algo, o executor consulta aqui.
 * A chave inclui a migração: retomar não duplica, mas migrar de novo de propósito cria outra cópia.
 */
export const idMap = sqliteTable(
  "id_map",
  {
    migrationId: text("migration_id").notNull(),
    destAccountId: text("dest_account_id").notNull(),
    level: text("level").notNull(),
    sourceId: text("source_id").notNull(),
    copyIndex: integer("copy_index").notNull().default(1),
    destId: text("dest_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.migrationId, t.destAccountId, t.level, t.sourceId, t.copyIndex] })],
);

/** Mídias baixadas (caminho C) ou copiadas (caminho B). */
export const media = sqliteTable(
  "media",
  {
    id: id(),
    sourceAccountId: text("source_account_id").notNull(),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    sourceRef: text("source_ref").notNull(), // hash da imagem ou ID do vídeo
    localPath: text("local_path"),
    sha256: text("sha256"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("media_source_unique").on(t.sourceAccountId, t.kind, t.sourceRef)],
);

export const mediaCopies = sqliteTable(
  "media_copies",
  {
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    destAccountId: text("dest_account_id").notNull(),
    destRef: text("dest_ref").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.destAccountId] })],
);

/** Mapeamentos salvos (ex.: pixel X → pixel Y nesta conta), reaproveitados nas próximas migrações. */
export const assetMappings = sqliteTable(
  "asset_mappings",
  {
    id: id(),
    destAccountId: text("dest_account_id").notNull(),
    kind: text("kind", {
      enum: ["pixel", "page", "instagram", "audience", "custom_conversion", "lead_form", "whatsapp"],
    }).notNull(),
    sourceId: text("source_id").notNull(),
    destId: text("dest_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("asset_mappings_unique").on(t.destAccountId, t.kind, t.sourceId)],
);

export const backupJobs = sqliteTable("backup_jobs", {
  id: id(),
  adAccountId: text("ad_account_id").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  frequencyHours: integer("frequency_hours").notNull().default(24),
  scope: text("scope", { enum: ["active", "active_and_recent"] }).notNull().default("active"),
  includeMedia: integer("include_media", { mode: "boolean" }).notNull().default(false),
  retention: integer("retention").notNull().default(7),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  createdAt: createdAt(),
});

export const backups = sqliteTable(
  "backups",
  {
    id: id(),
    jobId: text("job_id").references(() => backupJobs.id, { onDelete: "set null" }),
    adAccountId: text("ad_account_id").notNull(),
    status: text("status", { enum: ["running", "done", "failed"] }).notNull(),
    path: text("path"),
    stats: text("stats", { mode: "json" }),
    error: text("error"),
    startedAt: createdAt(),
    finishedAt: text("finished_at"),
  },
  (t) => [index("backups_account_idx").on(t.adAccountId)],
);

/** Registro técnico (nunca guarda token). */
export const logs = sqliteTable(
  "logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    level: text("level", { enum: ["debug", "info", "warn", "error"] }).notNull(),
    scope: text("scope").notNull(),
    message: text("message").notNull(),
    data: text("data", { mode: "json" }),
    createdAt: createdAt(),
  },
  (t) => [index("logs_created_idx").on(t.createdAt)],
);
