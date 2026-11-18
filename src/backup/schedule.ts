/** Regras de agendamento do backup (puras, testadas). */

export const FREQUENCIES = [6, 12, 24] as const;
export const RETENTIONS = [3, 7, 14, 30] as const;
export const TICK_MS = 5 * 60_000;

export interface JobTiming {
  enabled: boolean;
  frequencyHours: number;
  lastRunAt: string | null;
}

export function nextRunAt(job: JobTiming, now = Date.now()): Date | null {
  if (!job.enabled) return null;
  if (!job.lastRunAt) return new Date(now);
  return new Date(new Date(job.lastRunAt).getTime() + job.frequencyHours * 3_600_000);
}

export function isDue(job: JobTiming, now = Date.now()): boolean {
  const next = nextRunAt(job, now);
  return next !== null && next.getTime() <= now;
}

/** Quais backups apagar para manter só os `keep` mais recentes (os mais novos primeiro na lista). */
export function toPrune<T extends { startedAt: string }>(backups: T[], keep: number): T[] {
  return [...backups].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(Math.max(1, keep));
}
