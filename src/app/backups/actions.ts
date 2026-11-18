"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb, schema } from "@/db";
import { friendlyError } from "@/meta/errors";
import { countSelection, type Selection } from "@/lib/selection";
import { loadSnapshots, resolvedFromSnapshots } from "@/migration/snapshot";
import { FREQUENCIES, RETENTIONS } from "@/backup/schedule";
import { backupNow, isBackupRunning } from "@/backup/scheduler";
import { deleteBackup } from "@/backup/run";
import { getBackup, getJob, saveJob } from "@/backup/store";

const isAct = (v: string) => /^act_\d+$/.test(v);

export interface JobInput {
  enabled: boolean;
  frequencyHours: number;
  scope: "active" | "active_and_recent";
  includeMedia: boolean;
  retention: number;
}

export async function saveJobAction(account: string, input: JobInput): Promise<{ message?: string }> {
  if (!isAct(account)) return { message: "Conta inválida." };
  saveJob(account, {
    enabled: Boolean(input.enabled),
    frequencyHours: (FREQUENCIES as readonly number[]).includes(input.frequencyHours) ? input.frequencyHours : 24,
    scope: input.scope === "active_and_recent" ? "active_and_recent" : "active",
    includeMedia: Boolean(input.includeMedia),
    retention: (RETENTIONS as readonly number[]).includes(input.retention) ? input.retention : 7,
  });
  refresh();
  return {};
}

/** "Fazer backup agora". Espera terminar (costuma levar segundos). */
export async function backupNowAction(account: string): Promise<{ message?: string }> {
  if (!isAct(account)) return { message: "Conta inválida." };
  if (isBackupRunning(account)) return { message: "Já tem um backup desta conta em andamento." };
  const job = getJob(account);
  try {
    const r = await backupNow(account, {
      scope: job?.scope ?? "active",
      includeMedia: job?.includeMedia ?? false,
      retention: job?.retention ?? 7,
      jobId: job?.id,
    });
    refresh();
    if (r.status === "failed") return { message: r.error };
    return {};
  } catch (e) {
    return { message: friendlyError(e) };
  }
}

export async function deleteBackupAction(id: string) {
  const b = getBackup(id);
  if (!b || b.status === "running" || isBackupRunning(b.adAccountId)) return;
  deleteBackup(id);
  refresh();
}

/** Cria um rascunho de migração a partir de um backup — funciona mesmo sem acesso à conta de origem. */
export async function migrateFromBackupAction(backupId: string) {
  const b = getBackup(backupId);
  if (!b || b.status !== "done" || !b.stats?.snapshotIds?.length) return;
  const snaps = loadSnapshots(b.stats.snapshotIds);
  const resolved = resolvedFromSnapshots([...snaps.values()]);
  const selection: Selection = { campaigns: resolved.map((c) => c.id), adsets: [], ads: [], excluded: [] };
  const row = getDb()
    .insert(schema.migrations)
    .values({
      status: "draft",
      sourceAccountId: b.adAccountId,
      options: {
        selection,
        snapshotIds: b.stats.snapshotIds,
        fromBackup: b.id,
        sourceInfo: b.stats.account,
      },
      summary: { resolved, counts: countSelection(resolved) },
    })
    .returning({ id: schema.migrations.id })
    .get();
  redirect(`/migracoes/${row.id}`);
}
