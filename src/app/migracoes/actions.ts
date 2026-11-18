"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { friendlyError } from "@/meta/errors";
import { getGraph } from "@/meta/store";
import { deleteMigration, getItems, getMigration, updateMigration } from "@/meta/migrations";
import { takeSnapshots, loadSnapshots } from "@/migration/snapshot";
import { diagnose } from "@/migration/precheck";
import { loadSavedMappings, mergeMappings, saveMappings, sanitizeMappings } from "@/migration/mappings-store";
import { buildPlan } from "@/migration/planner";
import { MAX_COPIES } from "@/migration/mapper";
import { runMigration } from "@/migration/executor";
import { emit, endPlanning, isPlanning, isRunning, requestPause, tryStartPlanning } from "@/migration/events";

export interface ActionResult {
  message?: string;
}

const isAct = (v: string) => /^act_\d+$/.test(v);

export async function deleteDraftAction(id: string) {
  const m = getMigration(id);
  // Só rascunhos e planos que ainda não começaram (o histórico de migrações feitas fica).
  if (!m || isRunning(id) || isPlanning(id) || (m.status !== "draft" && m.status !== "planned")) return;
  deleteMigration(id);
  redirect("/migracoes");
}

/** Passo 3: escolhe o destino, lê o snapshot da origem, confere o destino e monta o plano (nada é criado). */
export async function planMigrationAction(
  id: string,
  dest: string,
  suffix: string,
  createActive: boolean,
  copiesInput = 1,
): Promise<ActionResult> {
  const m = getMigration(id);
  if (!m) return { message: "Migração não encontrada." };
  if (m.status !== "draft" && m.status !== "planned") return { message: "Esta migração já começou." };
  if (!isAct(dest)) return { message: "Escolha a conta de destino." };
  if (!tryStartPlanning(id)) return { message: "Esta migração já está sendo revisada ou executada." };

  try {
    const graph = getGraph();
    // Vindo de backup: usa os snapshots guardados (a origem pode nem existir mais). Senão, lê agora.
    const snapshotIds =
      m.options.fromBackup && m.options.snapshotIds?.length
        ? m.options.snapshotIds
        : await takeSnapshots(graph, m.sourceAccountId, m.resolved);
    const snaps = loadSnapshots(snapshotIds);
    // Mapeamentos salvos para este destino + os desta migração (se for o mesmo destino).
    const mappings = mergeMappings(loadSavedMappings(dest), m.destAccountId === dest ? m.options.mappings : undefined);
    const copies = Math.min(MAX_COPIES, Math.max(1, Math.floor(Number(copiesInput) || 1)));
    const diagnosis = await diagnose(graph, m.sourceAccountId, dest, [...snaps.values()], mappings, m.options.sourceInfo, { copies });
    const cleanSuffix = suffix.slice(0, 40);
    const createStatus = createActive ? "ACTIVE" : "PAUSED";
    const now = getMigration(id);
    if (!now || (now.status !== "draft" && now.status !== "planned")) return { message: "Esta migração já começou." };
    const plan = buildPlan(
      id,
      snapshotIds.map((sid) => ({ id: sid, data: snaps.get(sid)! })),
      { suffix: cleanSuffix, createStatus, copies, mappings },
      diagnosis,
    );
    updateMigration(id, {
      status: "planned",
      destAccountId: dest,
      options: { ...m.options, snapshotIds, suffix: cleanSuffix, createStatus, copies, mappings },
      summaryPatch: { plan },
    });
  } catch (e) {
    return { message: friendlyError(e) };
  } finally {
    endPlanning(id);
  }
  refresh();
  return {};
}

/** Tela de Mapeamento: salva as escolhas (e guarda para a próxima vez) e refaz o diagnóstico e o plano. */
export async function saveMappingsAction(id: string, input: unknown): Promise<ActionResult> {
  const m = getMigration(id);
  if (!m || m.status !== "planned" || !m.destAccountId) return { message: "Só dá para mapear antes de migrar." };
  const currency = m.plan?.currency;
  const fromUser = sanitizeMappings(input, currency ? { from: currency.source, to: currency.dest } : undefined);
  const mappings = mergeMappings(m.options.mappings, fromUser);
  if (!fromUser.currency) delete mappings.currency;
  if (fromUser.currency) mappings.currency = fromUser.currency;
  if (!tryStartPlanning(id)) return { message: "Esta migração já está sendo revisada ou executada." };

  try {
    saveMappings(m.destAccountId, fromUser);
    const snapshotIds = m.options.snapshotIds ?? [];
    const snaps = loadSnapshots(snapshotIds);
    const diagnosis = await diagnose(getGraph(), m.sourceAccountId, m.destAccountId, [...snaps.values()], mappings, m.options.sourceInfo, { copies: m.options.copies });
    if (getMigration(id)?.status !== "planned") return { message: "Esta migração já começou." };
    const plan = buildPlan(
      id,
      snapshotIds.map((sid) => ({ id: sid, data: snaps.get(sid)! })),
      { suffix: m.options.suffix ?? "", createStatus: m.options.createStatus ?? "PAUSED", copies: m.options.copies, mappings },
      diagnosis,
    );
    updateMigration(id, { options: { ...m.options, mappings }, summaryPatch: { plan } });
  } catch (e) {
    return { message: friendlyError(e) };
  } finally {
    endPlanning(id);
  }
  refresh();
  return {};
}

/** Volta para a escolha do destino (só antes de começar). */
export async function backToDestinationAction(id: string) {
  const m = getMigration(id);
  if (m?.status !== "planned" || isPlanning(id)) return;
  getDb().delete(schema.migrationItems).where(eq(schema.migrationItems.migrationId, id)).run();
  updateMigration(id, { status: "draft" });
  refresh();
}

/** Migrar agora / Retomar. A execução continua em segundo plano; a tela acompanha pelo SSE. */
export async function startMigrationAction(id: string): Promise<ActionResult> {
  const m = getMigration(id);
  if (!m) return { message: "Migração não encontrada." };
  if (isRunning(id)) return {};
  if (isPlanning(id)) return { message: "Espere a revisão terminar antes de migrar." };
  if (!["planned", "paused", "failed", "done_with_issues"].includes(m.status)) return { message: "Esta migração não pode ser iniciada agora." };
  if (m.plan?.checks.some((c) => c.level === "block")) return { message: "Resolva os itens em vermelho da checagem antes de migrar." };
  if (!getItems(id).some((i) => i.status === "pending" || i.status === "failed")) return { message: "Não há nada pendente." };

  let graph;
  try {
    graph = getGraph({ onWait: (minutes) => emit(id, { type: "wait", minutes }) });
  } catch (e) {
    return { message: friendlyError(e) };
  }
  // Marca como "migrando" já, para a tela abrir no modo de execução.
  updateMigration(id, { status: "running" });
  void runMigration(id, graph).catch((e) => {
    updateMigration(id, { status: "paused", summaryPatch: { run: { message: friendlyError(e) } } });
    emit(id, { type: "status", status: "paused", message: friendlyError(e) });
  });
  refresh();
  return {};
}

export async function pauseMigrationAction(id: string) {
  if (isRunning(id)) requestPause(id);
}
