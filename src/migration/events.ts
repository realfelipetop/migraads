import { EventEmitter } from "node:events";

/**
 * Eventos de progresso das migrações (no próprio processo do Node).
 * A tela de Execução assina via Server-Sent Events (/api/migrations/[id]/events).
 */

export type ProgressEvent =
  | { type: "item"; id: string; level: string; name: string | null; status: string; destId: string | null; error: string | null }
  | { type: "status"; status: string; message?: string }
  | { type: "wait"; minutes: number };

interface Registry {
  emitter: EventEmitter;
  running: Set<string>;
  pauseRequested: Set<string>;
  planning: Set<string>;
}

function registry(): Registry {
  const g = globalThis as unknown as { __migraRuns?: Registry };
  if (!g.__migraRuns) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100);
    g.__migraRuns = { emitter, running: new Set(), pauseRequested: new Set(), planning: new Set() };
  }
  return g.__migraRuns;
}

export const emit = (migrationId: string, e: ProgressEvent) => registry().emitter.emit(migrationId, e);

export function subscribe(migrationId: string, fn: (e: ProgressEvent) => void): () => void {
  const em = registry().emitter;
  em.on(migrationId, fn);
  return () => em.off(migrationId, fn);
}

export const isRunning = (id: string) => registry().running.has(id);
export const markRunning = (id: string) => registry().running.add(id);
export const markStopped = (id: string) => {
  registry().running.delete(id);
  registry().pauseRequested.delete(id);
};
export const requestPause = (id: string) => registry().pauseRequested.add(id);
export const pauseRequested = (id: string) => registry().pauseRequested.has(id);

/**
 * Trava de planejamento (achado da revisão): enquanto "Revisar" ou "Salvar mapeamento" estão
 * refazendo o plano, a migração não pode começar — e vice-versa.
 */
export function tryStartPlanning(id: string): boolean {
  const r = registry();
  r.planning ??= new Set();
  if (r.planning.has(id) || r.running.has(id)) return false;
  r.planning.add(id);
  return true;
}
export const endPlanning = (id: string) => registry().planning?.delete(id);
export const isPlanning = (id: string) => Boolean(registry().planning?.has(id));
