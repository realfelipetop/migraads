import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { BackupScope, BackupStats } from "./run";
import { nextRunAt } from "./schedule";

export type JobRow = typeof schema.backupJobs.$inferSelect;
export type BackupRow = typeof schema.backups.$inferSelect & { stats: BackupStats | null };

export function listJobs(): JobRow[] {
  return getDb().select().from(schema.backupJobs).all();
}

export function getJob(adAccountId: string): JobRow | undefined {
  return getDb().select().from(schema.backupJobs).where(eq(schema.backupJobs.adAccountId, adAccountId)).get();
}

export function saveJob(
  adAccountId: string,
  patch: { enabled: boolean; frequencyHours: number; scope: BackupScope; includeMedia: boolean; retention: number },
) {
  const db = getDb();
  const current = getJob(adAccountId);
  const next = nextRunAt({ ...patch, lastRunAt: current?.lastRunAt ?? null })?.toISOString() ?? null;
  db.insert(schema.backupJobs)
    .values({ adAccountId, ...patch, nextRunAt: next })
    .onConflictDoUpdate({ target: schema.backupJobs.adAccountId, set: { ...patch, nextRunAt: next } })
    .run();
}

export function markJobRun(adAccountId: string, at = new Date()) {
  const job = getJob(adAccountId);
  if (!job) return;
  const next = nextRunAt({ ...job, lastRunAt: at.toISOString() })?.toISOString() ?? null;
  getDb().update(schema.backupJobs).set({ lastRunAt: at.toISOString(), nextRunAt: next }).where(eq(schema.backupJobs.id, job.id)).run();
}

export function listBackups(limit = 100): BackupRow[] {
  return getDb().select().from(schema.backups).orderBy(desc(schema.backups.startedAt)).limit(limit).all() as BackupRow[];
}

export function getBackup(id: string): BackupRow | undefined {
  return getDb().select().from(schema.backups).where(eq(schema.backups.id, id)).get() as BackupRow | undefined;
}
