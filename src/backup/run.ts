import { createWriteStream, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { dataDir } from "@/lib/paths";
import type { Graph } from "@/meta/graph";
import { friendlyError } from "@/meta/errors";
import type { ResolvedCampaign } from "@/lib/selection";
import { loadSnapshots, takeSnapshots, type SnapshotData } from "@/migration/snapshot";
import type { Obj } from "@/migration/mapper";
import { toPrune } from "./schedule";

export type BackupScope = "active" | "active_and_recent";

export interface BackupStats {
  campaigns: number;
  adsets: number;
  ads: number;
  snapshotIds: string[];
  account?: { name?: string; currency: string; timezone: string };
  media?: { images: number; videos: number; failed: number };
}

type Reader = Pick<Graph, "get" | "getAll" | "version">;

/** Campanhas que entram no backup. "active_and_recent" = ativas + as que gastaram nos últimos 30 dias. */
export async function pickCampaigns(graph: Reader, account: string, scope: BackupScope): Promise<string[]> {
  const active = await graph.getAll<{ id: string }>(`${account}/campaigns`, { fields: "id", effective_status: ["ACTIVE"], limit: 200 });
  const ids = new Set(active.map((c) => c.id));
  if (scope === "active_and_recent") {
    const spent = await graph
      .getAll<{ campaign_id: string; spend?: string }>(`${account}/insights`, {
        level: "campaign",
        date_preset: "last_30d",
        fields: "campaign_id,spend",
        limit: 500,
      })
      .catch(() => []);
    for (const r of spent) if (Number(r.spend ?? 0) > 0) ids.add(r.campaign_id);
  }
  return [...ids];
}

async function download(url: string, file: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
}

/** Melhor esforço: imagens pela biblioteca da conta, vídeos quando a Meta libera o arquivo (achado 3 da Fase 0). */
async function backupMedia(graph: Reader, account: string, snaps: SnapshotData[], dir: string, pageGraphs: Reader[] = []) {
  const out = { images: 0, videos: 0, failed: 0 };
  const hashes = new Set<string>();
  const videos = new Set<string>();
  for (const s of snaps)
    for (const ad of s.ads) {
      const cr = (ad.creative ?? {}) as Obj;
      if (cr.image_hash) hashes.add(String(cr.image_hash));
      if (cr.video_id) videos.add(String(cr.video_id));
      const feed = (cr.asset_feed_spec ?? {}) as { images?: { hash: string }[]; videos?: { video_id: string }[] };
      feed.images?.forEach((i) => hashes.add(i.hash));
      feed.videos?.forEach((v) => videos.add(v.video_id));
    }
  if (!hashes.size && !videos.size) return out;
  const mediaDir = path.join(dir, "midias");
  mkdirSync(mediaDir, { recursive: true });

  const list = hashes.size
    ? await graph.getAll<{ hash: string; url?: string }>(`${account}/adimages`, { hashes: [...hashes], fields: "hash,url" }).catch(() => [])
    : [];
  for (const img of list) {
    if (!img.url) continue;
    try {
      await download(img.url, path.join(mediaDir, `img-${img.hash}.jpg`));
      out.images++;
    } catch {
      out.failed++;
    }
  }
  out.failed += hashes.size - list.filter((i) => i.url).length;
  for (const id of videos) {
    // Vídeos ficam presos à página: o token do usuário quase nunca libera o arquivo, o da página às vezes sim.
    let source: string | undefined;
    for (const g of [graph, ...pageGraphs]) {
      source = await g.get<{ source?: string }>(id, { fields: "source" }).then((v) => v.source).catch(() => undefined);
      if (source) break;
    }
    try {
      if (!source) throw new Error("sem arquivo");
      await download(source, path.join(mediaDir, `video-${id}.mp4`));
      out.videos++;
    } catch {
      out.failed++;
    }
  }
  return out;
}

/** Faz um backup de uma conta. Grava no banco (snapshots) e em data/backups/<conta>/<data>/backup.json. */
export async function runBackup(
  graph: Reader,
  account: string,
  opts: { scope: BackupScope; includeMedia: boolean; retention: number; jobId?: string; pageGraphs?: () => Promise<Reader[]> },
): Promise<{ id: string; status: "done" | "failed"; stats?: BackupStats; error?: string }> {
  const db = getDb();
  const row = db.insert(schema.backups).values({ jobId: opts.jobId, adAccountId: account, status: "running" }).returning().get();
  const stamp = row.startedAt.replace(/[:.]/g, "-");
  const dir = dataDir("backups", account.replace("act_", ""), stamp);

  try {
    const info = await graph.get<{ name?: string; currency: string; timezone_name: string }>(account, { fields: "name,currency,timezone_name" });
    const campaignIds = await pickCampaigns(graph, account, opts.scope);
    const resolved: ResolvedCampaign[] = campaignIds.map((id) => ({ id, name: id, whole: true, adsets: [], skippedDisapproved: 0 }));
    const snapshotIds = await takeSnapshots(graph, account, resolved, { origin: "backup", everything: true });
    const snaps = [...loadSnapshots(snapshotIds).values()];

    const stats: BackupStats = {
      campaigns: snaps.length,
      adsets: snaps.reduce((n, s) => n + s.adsets.length, 0),
      ads: snaps.reduce((n, s) => n + s.ads.length, 0),
      snapshotIds,
      account: { name: info.name, currency: info.currency, timezone: info.timezone_name },
    };
    writeFileSync(
      path.join(dir, "backup.json"),
      JSON.stringify({ app: "migra-ads", account, takenAt: row.startedAt, apiVersion: graph.version, stats, snapshots: snaps }, null, 2),
    );
    if (opts.includeMedia) stats.media = await backupMedia(graph, account, snaps, dir, (await opts.pageGraphs?.().catch(() => [])) ?? []);

    db.update(schema.backups)
      .set({ status: "done", stats, path: dir, finishedAt: new Date().toISOString() })
      .where(eq(schema.backups.id, row.id))
      .run();
    pruneBackups(account, opts.retention);
    return { id: row.id, status: "done", stats };
  } catch (e) {
    const error = friendlyError(e);
    // Backup que falhou não serve para migrar: apaga a pasta parcial e os snapshots que chegou a gravar.
    rmSync(dir, { recursive: true, force: true });
    const partial = getDb()
      .select({ id: schema.snapshots.id })
      .from(schema.snapshots)
      .where(and(eq(schema.snapshots.sourceAccountId, account), eq(schema.snapshots.origin, "backup"), gte(schema.snapshots.takenAt, row.startedAt)))
      .all()
      .map((r) => r.id)
      .filter((sid) => !referencedSnapshots().has(sid));
    if (partial.length) db.delete(schema.snapshots).where(inArray(schema.snapshots.id, partial)).run();
    db.update(schema.backups).set({ status: "failed", error, path: null, finishedAt: new Date().toISOString() }).where(eq(schema.backups.id, row.id)).run();
    pruneFailed(account);
    return { id: row.id, status: "failed", error };
  }
}

/** Apaga um backup (registro, snapshots que só ele usa e a pasta). */
export function deleteBackup(id: string) {
  const db = getDb();
  const b = db.select().from(schema.backups).where(eq(schema.backups.id, id)).get();
  if (!b) return;
  const snapshotIds = ((b.stats as BackupStats | null)?.snapshotIds ?? []).filter(Boolean);
  // Snapshot usado por uma migração continua (a migração precisa dele).
  const inUse = referencedSnapshots();
  const removable = snapshotIds.filter((s) => !inUse.has(s));
  if (removable.length) db.delete(schema.snapshots).where(inArray(schema.snapshots.id, removable)).run();
  db.delete(schema.backups).where(eq(schema.backups.id, id)).run();
  if (b.path && b.path.startsWith(dataDir("backups") + path.sep)) rmSync(b.path, { recursive: true, force: true });
}

/** Snapshots usados por alguma migração (não podem ser apagados junto com o backup). */
function referencedSnapshots(): Set<string> {
  return new Set(
    getDb()
      .select({ options: schema.migrations.options })
      .from(schema.migrations)
      .all()
      .flatMap((m) => ((m.options as { snapshotIds?: string[] } | null)?.snapshotIds ?? [])),
  );
}

/** Guarda só as 5 falhas mais recentes da conta (para mostrar o motivo), sem acumular para sempre. */
function pruneFailed(account: string) {
  const failed = getDb()
    .select()
    .from(schema.backups)
    .where(and(eq(schema.backups.adAccountId, account), eq(schema.backups.status, "failed")))
    .orderBy(desc(schema.backups.startedAt))
    .all();
  for (const old of failed.slice(5)) getDb().delete(schema.backups).where(eq(schema.backups.id, old.id)).run();
}

export function pruneBackups(account: string, keep: number) {
  const done = getDb()
    .select()
    .from(schema.backups)
    .where(and(eq(schema.backups.adAccountId, account), eq(schema.backups.status, "done")))
    .orderBy(desc(schema.backups.startedAt))
    .all();
  for (const old of toPrune(done, keep)) deleteBackup(old.id);
}
