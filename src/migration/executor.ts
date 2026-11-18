import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { GraphError } from "@/meta/graph";
import { friendlyError } from "@/meta/errors";
import { getMigration, getItems, updateMigration, type ItemRow, type MigrationStatus } from "@/meta/migrations";
import { copySuffix, mapAd, mapAdset, mapCampaign, mapCreative, manualReasonFor, postIdOf, type CreateStatus, type Obj } from "./mapper";
import { loadSnapshots, type SnapshotData } from "./snapshot";
import { emit, isRunning, markRunning, markStopped, pauseRequested } from "./events";

/** O mínimo do cliente da Graph API que o executor usa (facilita os testes). */
export interface Poster {
  post<T = unknown>(path: string, body: Record<string, unknown>): Promise<T>;
  getAll<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T[]>;
}

/** Interrompe a execução inteira (sem conexão, token expirado, pausa pedida). Itens não são marcados como falha. */
class Halt extends Error {}

const now = () => new Date().toISOString();

/**
 * Executa (ou retoma) uma migração planejada.
 * Ordem: campanhas → conjuntos → criativos → anúncios. Antes de criar qualquer coisa,
 * consulta o id_map: o que já existe no destino é pulado. Por isso dá para retomar sem duplicar.
 */
export async function runMigration(migrationId: string, graph: Poster): Promise<MigrationStatus> {
  if (isRunning(migrationId)) return "running";
  const m = getMigration(migrationId);
  if (!m || !m.destAccountId) throw new Error("Migração sem destino definido.");
  const dest = m.destAccountId;
  const status: CreateStatus = m.options.createStatus ?? "PAUSED";
  const suffix = m.options.suffix ?? "";
  const copies = Math.max(1, m.options.copies ?? 1);
  const mappings = m.options.mappings;
  const snaps = loadSnapshots(m.options.snapshotIds ?? []);

  markRunning(migrationId);
  updateMigration(migrationId, { status: "running", startedAt: m.startedAt ?? now(), summaryPatch: { run: {} } });
  emit(migrationId, { type: "status", status: "running" });

  const db = getDb();
  /** Criativos são compartilhados entre as cópias (um por post): sempre na cópia 1. */
  const lookup = (level: string, sourceId: string, copy = 1) =>
    db
      .select()
      .from(schema.idMap)
      .where(
        and(
          eq(schema.idMap.migrationId, migrationId),
          eq(schema.idMap.destAccountId, dest),
          eq(schema.idMap.level, level),
          eq(schema.idMap.sourceId, sourceId),
          eq(schema.idMap.copyIndex, level === "creative" ? 1 : copy),
        ),
      )
      .get()?.destId;

  const setItem = (item: ItemRow, patch: Partial<ItemRow>) => {
    const next = { ...item, ...patch };
    db.update(schema.migrationItems)
      .set({ status: next.status, destId: next.destId, error: next.error, attempts: next.attempts, warnings: next.warnings })
      .where(eq(schema.migrationItems.id, item.id))
      .run();
    Object.assign(item, next);
    emit(migrationId, { type: "item", id: item.id, level: item.level, name: item.name, status: next.status, destId: next.destId, error: next.error });
  };

  const record = (level: string, sourceId: string, destId: string, copy = 1) =>
    db
      .insert(schema.idMap)
      .values({ migrationId, destAccountId: dest, level, sourceId, destId, copyIndex: level === "creative" ? 1 : copy })
      .onConflictDoNothing()
      .run();

  /** Tudo que qualquer migração já registrou neste destino: nunca é adotado por outra. */
  const mappedIds = () =>
    new Set(db.select().from(schema.idMap).where(eq(schema.idMap.destAccountId, dest)).all().map((r) => r.destId));

  /**
   * Retomada segura (achado do teste real da Fase 4): se o app cair no instante em que a Meta cria
   * algo, o objeto existe no destino mas não foi anotado. Ao retomar, antes de criar, procura no
   * destino um objeto igual (mesmo nome, mesmo pai, criado depois do início desta migração) que
   * ainda não esteja no id_map — e adota em vez de criar outro.
   */
  const resuming = Boolean(m.startedAt);
  const startedMs = m.startedAt ? new Date(m.startedAt).getTime() - 60_000 : 0;
  let attemptedBefore = false; // o item atual já tinha sido tentado numa execução anterior?
  const findOrphan = async (
    path: string,
    fields: string,
    match: (o: Obj) => boolean,
    params: Record<string, unknown> = {},
  ): Promise<string | undefined> => {
    if (!resuming || !attemptedBefore) return undefined;
    const taken = mappedIds();
    const found = await graph.getAll<Obj>(path, { fields: `id,name,created_time,${fields}`, limit: 200, ...params });
    const hit = found.find(
      (o) => !taken.has(String(o.id)) && match(o) && (!o.created_time || new Date(String(o.created_time)).getTime() >= startedMs),
    );
    return hit ? String(hit.id) : undefined;
  };

  /** Cria no destino uma vez só. Devolve o ID (novo, já registrado ou adotado). */
  const createOnce = async (
    level: string,
    sourceId: string,
    edge: string,
    payload: Obj,
    adopt?: () => Promise<string | undefined>,
    copy = 1,
  ): Promise<string> => {
    const existing = lookup(level, sourceId, copy);
    if (existing) return existing;
    const orphan = adopt ? await adopt() : undefined;
    if (orphan) {
      record(level, sourceId, orphan, copy);
      return orphan;
    }
    const res = await graph.post<{ id: string }>(`${dest}/${edge}`, payload);
    record(level, sourceId, res.id, copy);
    return res.id;
  };

  /** Criativos iguais (mesmo post e mesma configuração) são compartilhados; diferentes (ex.: outras UTMs) não. */
  const creativeKey = (postId: string, payload: Obj) => {
    const { name: _n, ...rest } = payload;
    void _n;
    return `${postId}#${createHash("sha1").update(JSON.stringify(rest)).digest("hex").slice(0, 12)}`;
  };

  /** Erro que deve parar tudo (e permitir retomar depois). */
  const haltIfGlobal = (e: unknown) => {
    if (e instanceof GraphError && (e.status === 0 || e.code === 190)) throw new Halt(friendlyError(e));
  };

  const checkPause = () => {
    if (pauseRequested(migrationId)) throw new Halt("Pausada por você. Clique em Retomar para continuar de onde parou.");
  };

  let final: MigrationStatus;
  try {
    const items = getItems(migrationId).filter((i) => i.status === "pending" || i.status === "failed");
    const order = { campaign: 0, adset: 1, media: 2, creative: 2, ad: 3 } as const;
    items.sort((a, b) => order[a.level] - order[b.level]);

    for (const item of items) {
      checkPause();
      const snap = snaps.get(item.snapshotId ?? "") as SnapshotData | undefined;
      if (!snap) {
        setItem(item, { status: "failed", error: "Snapshot da origem não encontrado." });
        continue;
      }
      const campaign = snap.campaign;
      const copy = item.copyIndex;
      // Marca a tentativa ANTES de falar com a Meta: se o app cair no meio, a retomada sabe que
      // este item pode ter sido criado e procura no destino (e só neste caso).
      attemptedBefore = item.attempts > 0;
      item.attempts += 1;
      db.update(schema.migrationItems).set({ attempts: item.attempts }).where(eq(schema.migrationItems.id, item.id)).run();
      const itemSuffix = copySuffix(suffix, copies, copy);
      try {
        if (item.level === "campaign") {
          const { payload } = mapCampaign(campaign, { suffix: itemSuffix, status, mappings });
          const id = await createOnce("campaign", item.sourceId, "campaigns", payload, () =>
            findOrphan(`${dest}/campaigns`, "objective", (o) => o.name === payload.name, {
              filtering: [{ field: "name", operator: "EQUAL", value: payload.name }],
            }),
            copy,
          );
          setItem(item, { status: "done", destId: id, error: null, attempts: item.attempts });
        } else if (item.level === "adset") {
          const adset = snap.adsets.find((s) => String(s.id) === item.sourceId)!;
          const newCampaign = lookup("campaign", String(campaign.id), copy);
          if (!newCampaign) {
            setItem(item, { status: "failed", error: "A campanha não foi criada, então o conjunto ficou para depois." });
            continue;
          }
          const { payload, warnings } = mapAdset(adset, campaign, { newCampaignId: newCampaign, status, mappings });
          const id = await createOnce("adset", item.sourceId, "adsets", payload, () =>
            findOrphan(`${newCampaign}/adsets`, "campaign_id", (o) => o.name === payload.name),
            copy,
          );
          setItem(item, { status: "done", destId: id, error: null, attempts: item.attempts, warnings });
        } else if (item.level === "ad") {
          const ad = snap.ads.find((a) => String(a.id) === item.sourceId)!;
          const newAdset = lookup("adset", String(ad.adset_id), copy);
          if (!newAdset) {
            setItem(item, { status: "failed", error: "O conjunto não foi criado, então o anúncio ficou para depois." });
            continue;
          }
          const cr = mapCreative(ad, { suffix, mappings });
          if ("manual" in cr) {
            setItem(item, { status: "manual", error: cr.manual });
            continue;
          }
          let creativeId: string;
          try {
            // Um criativo por post: anúncios que usam o mesmo post compartilham o criativo.
            creativeId = await createOnce("creative", creativeKey(postIdOf(ad.creative as Obj)!, cr.payload), "adcreatives", cr.payload);
          } catch (e) {
            haltIfGlobal(e);
            const manual = e instanceof GraphError ? manualReasonFor(e.code, e.subcode) : undefined;
            if (manual) {
              setItem(item, { status: "manual", error: manual, attempts: item.attempts });
              continue;
            }
            throw e;
          }
          const { payload } = mapAd(ad, { newAdsetId: newAdset, creativeId, status, mappings });
          const id = await createOnce("ad", item.sourceId, "ads", payload, () =>
            findOrphan(
              `${newAdset}/ads`,
              "creative{id}",
              (o) => o.name === payload.name && (o.creative as Obj | undefined)?.id === creativeId,
            ),
            copy,
          );
          setItem(item, { status: "done", destId: id, error: null, attempts: item.attempts, warnings: cr.warnings });
        }
      } catch (e) {
        if (e instanceof Halt) throw e; // pausa/queda/token: para tudo, não marca o item como falha
        haltIfGlobal(e);
        setItem(item, { status: "failed", error: friendlyError(e), attempts: item.attempts });
      }
    }

    const all = getItems(migrationId);
    const campaignFailed = all.some((i) => i.level === "campaign" && i.status === "failed");
    const issues = all.some((i) => i.status === "failed" || i.status === "manual");
    final = campaignFailed && !all.some((i) => i.status === "done") ? "failed" : issues ? "done_with_issues" : "done";
    updateMigration(migrationId, { status: final, finishedAt: now(), summaryPatch: { run: {} } });
    emit(migrationId, { type: "status", status: final });
  } catch (e) {
    const message = e instanceof Halt ? e.message : friendlyError(e);
    final = "paused";
    updateMigration(migrationId, { status: final, summaryPatch: { run: { message } } });
    emit(migrationId, { type: "status", status: final, message });
  } finally {
    markStopped(migrationId);
  }
  return final;
}

/** Status "Migrando" no banco sem execução ativa = o app foi fechado no meio. Vira "Pausada". */
export function reconcileInterrupted(migrationId: string) {
  const m = getMigration(migrationId);
  if (m?.status === "running" && !isRunning(migrationId)) {
    updateMigration(migrationId, {
      status: "paused",
      summaryPatch: { run: { message: "A migração foi interrompida (o app foi fechado ou reiniciado). Clique em Retomar." } },
    });
  }
}
