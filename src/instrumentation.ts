/**
 * Roda uma vez quando o servidor do Migra Ads sobe (Next.js instrumentation).
 * Liga o agendador do backup automático — só no Node, e nunca durante o build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startScheduler } = await import("./backup/scheduler");
  startScheduler();
}
