import { getAppConfig, getConnectionStatus, getGraph } from "@/meta/store";
import { Graph } from "@/meta/graph";
import { listJobs, markJobRun } from "./store";
import { runBackup, type BackupScope } from "./run";
import { isDue, TICK_MS } from "./schedule";

/**
 * Agendador do backup automático. Roda dentro do próprio app: só funciona com o computador
 * ligado e o Migra Ads aberto (o app avisa isso na tela).
 */
interface State {
  started: boolean;
  running: Set<string>;
}

function state(): State {
  const g = globalThis as unknown as { __migraBackup?: State };
  return (g.__migraBackup ??= { started: false, running: new Set() });
}

export const isBackupRunning = (account: string) => state().running.has(account);

/** Faz o backup de uma conta agora (botão ou agendador). Não roda dois ao mesmo tempo na mesma conta. */
export async function backupNow(account: string, opts: { scope: BackupScope; includeMedia: boolean; retention: number; jobId?: string }) {
  const st = state();
  if (st.running.has(account)) return { status: "running" as const };
  st.running.add(account);
  try {
    const graph = getGraph();
    const result = await runBackup(graph, account, { ...opts, pageGraphs: () => pageGraphs(graph) });
    if (opts.jobId) markJobRun(account);
    return result;
  } finally {
    st.running.delete(account);
  }
}

/** Um cliente por página que o usuário administra (o token da página libera mais vídeos). */
async function pageGraphs(graph: Graph): Promise<Graph[]> {
  const app = getAppConfig();
  const pages = await graph.getAll<{ id: string; access_token?: string }>("me/accounts", { fields: "id,access_token", limit: 100 });
  return pages.filter((p) => p.access_token).map((p) => new Graph({ accessToken: p.access_token!, appSecret: app?.appSecret }));
}

export async function tick(now = Date.now()) {
  const conn = getConnectionStatus();
  if (conn.state !== "ok" && conn.state !== "expiring") return; // sem conexão: tenta no próximo ciclo
  for (const job of listJobs()) {
    if (!isDue(job, now) || isBackupRunning(job.adAccountId)) continue;
    await backupNow(job.adAccountId, {
      scope: job.scope,
      includeMedia: job.includeMedia,
      retention: job.retention,
      jobId: job.id,
    }).catch(() => markJobRun(job.adAccountId)); // falhou: registra e tenta no próximo horário
  }
}

export function startScheduler() {
  const st = state();
  if (st.started) return;
  st.started = true;
  const run = () => void tick().catch(() => {});
  setTimeout(run, 30_000).unref(); // espera o app terminar de subir
  setInterval(run, TICK_MS).unref();
}
