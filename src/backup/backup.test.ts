import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isDue, nextRunAt, toPrune } from "./schedule";
import { pruneBackups, runBackup } from "./run";
import { listBackups } from "./store";
import { loadSnapshots, resolvedFromSnapshots } from "@/migration/snapshot";
import { diagnose } from "@/migration/precheck";
import { GraphError } from "@/meta/graph";

describe("agendamento", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  it("nunca rodou → roda já; desligado → nunca", () => {
    expect(isDue({ enabled: true, frequencyHours: 24, lastRunAt: null }, now)).toBe(true);
    expect(isDue({ enabled: false, frequencyHours: 24, lastRunAt: null }, now)).toBe(false);
  });
  it("respeita a frequência", () => {
    const job = { enabled: true, frequencyHours: 6, lastRunAt: "2026-11-12T08:00:00Z" };
    expect(isDue(job, now)).toBe(false);
    expect(nextRunAt(job, now)?.toISOString()).toBe("2026-11-12T14:00:00.000Z");
    expect(isDue(job, Date.parse("2026-11-12T14:00:00Z"))).toBe(true);
  });
  it("retenção: apaga os mais antigos além de N", () => {
    const list = ["2026-11-10", "2026-11-12", "2026-11-11", "2026-11-09"].map((d) => ({ startedAt: d }));
    expect(toPrune(list, 2).map((b) => b.startedAt)).toEqual(["2026-11-10", "2026-11-09"]);
  });
});

/** Conta falsa com 1 campanha ativa (1 conjunto, 2 anúncios). */
function fakeAccount() {
  return {
    version: "v26.0",
    get: async <T,>(p: string) => {
      if (p === "act_7") return { name: "Conta 7", currency: "BRL", timezone_name: "America/Sao_Paulo" } as T;
      if (p === "c1") return { id: "c1", name: "PRODUTO X", daily_budget: "18200", objective: "OUTCOME_SALES" } as T;
      throw new Error(`get ${p}`);
    },
    getAll: async <T,>(p: string) => {
      if (p === "act_7/campaigns") return [{ id: "c1" }] as T[];
      if (p === "c1/adsets") return [{ id: "s1", name: "CONJ1", campaign_id: "c1", promoted_object: { pixel_id: "PX" } }] as T[];
      if (p === "c1/ads")
        return [
          { id: "a1", name: "AD01", adset_id: "s1", creative: { effective_object_story_id: "PG_1" } },
          { id: "a2", name: "AD02", adset_id: "s1", creative: { effective_object_story_id: "PG_2" } },
        ] as T[];
      return [] as T[];
    },
  } as unknown as Parameters<typeof runBackup>[0];
}

describe("backup", () => {
  it("salva a campanha inteira no banco e em data/backups/…/backup.json", async () => {
    const r = await runBackup(fakeAccount(), "act_7", { scope: "active", includeMedia: false, retention: 7 });
    expect(r.status).toBe("done");
    expect(r.stats).toMatchObject({ campaigns: 1, adsets: 1, ads: 2, account: { currency: "BRL" } });
    const b = listBackups().find((x) => x.id === r.id)!;
    expect(existsSync(path.join(b.path!, "backup.json"))).toBe(true);
    const json = JSON.parse(readFileSync(path.join(b.path!, "backup.json"), "utf8"));
    expect(json.snapshots[0].ads).toHaveLength(2);
  });

  it("migrar a partir do backup funciona mesmo com a origem INACESSÍVEL", async () => {
    const r = await runBackup(fakeAccount(), "act_7", { scope: "active", includeMedia: false, retention: 7 });
    const snaps = [...loadSnapshots(r.stats!.snapshotIds).values()];
    // Árvore do rascunho vem só do backup:
    expect(resolvedFromSnapshots(snaps)[0].adsets[0].ads.map((a) => a.name)).toEqual(["AD01", "AD02"]);
    // A conta de origem "caiu": qualquer leitura dela falha. O diagnóstico usa a moeda guardada no backup.
    const destOnly = {
      get: async <T,>(p: string) => {
        if (p === "act_7") throw new GraphError("Unsupported get request", 400, 100, 33);
        return { account_id: "8", account_status: 1, currency: "BRL", timezone_name: "America/Sao_Paulo", funding_source_details: {} } as T;
      },
      getAll: async <T,>(p: string) => (p.endsWith("/adspixels") ? [{ id: "PX", name: "Pixel" }] : p === "me/accounts" ? [] : []) as T[],
    } as unknown as Parameters<typeof diagnose>[0];
    const d = await diagnose(destOnly, "act_7", "act_8", snaps, {}, { currency: "BRL", timezone: "America/Sao_Paulo" });
    expect(d.checks.find((c) => c.id === "currency")?.level).toBe("ok");
    expect(d.checks.find((c) => c.id === "pixel")?.level).toBe("ok");
  });

  it("retenção apaga os backups antigos da conta", async () => {
    for (let i = 0; i < 3; i++) await runBackup(fakeAccount(), "act_7", { scope: "active", includeMedia: false, retention: 30 });
    pruneBackups("act_7", 2);
    expect(listBackups().filter((b) => b.adAccountId === "act_7" && b.status === "done")).toHaveLength(2);
  });

  it("conta sem acesso → backup marcado como falhou, com motivo", async () => {
    const broken = { ...fakeAccount(), get: async () => { throw new GraphError("Invalid OAuth access token", 400, 190); } } as unknown as Parameters<typeof runBackup>[0];
    const r = await runBackup(broken, "act_7", { scope: "active", includeMedia: false, retention: 7 });
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/Conecte de novo|expirou/);
  });
});

describe("backup que falha (revisão)", () => {
  it("não deixa snapshots nem pasta parcial para trás", async () => {
    const { getDb, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const count = () => getDb().select().from(schema.snapshots).where(eq(schema.snapshots.sourceAccountId, "act_9")).all().length;
    const before = count();
    // 2 campanhas ativas: a 1ª é salva, a 2ª falha → o snapshot da 1ª precisa ser apagado.
    const base = fakeAccount() as unknown as { get: (p: string) => Promise<unknown>; getAll: (p: string) => Promise<unknown[]> };
    const flaky = {
      version: "v26.0",
      get: async (p: string) => {
        if (p === "act_9") return { name: "Conta 9", currency: "BRL", timezone_name: "America/Sao_Paulo" };
        if (p === "c2") throw new GraphError("Falha de rede ao falar com a Meta", 0);
        return base.get(p);
      },
      getAll: async (p: string) => (p === "act_9/campaigns" ? [{ id: "c1" }, { id: "c2" }] : base.getAll(p)),
    } as unknown as Parameters<typeof runBackup>[0];
    const r = await runBackup(flaky, "act_9", { scope: "active", includeMedia: false, retention: 7 });
    expect(r.status).toBe("failed");
    expect(count()).toBe(before);
    expect(listBackups().find((b) => b.id === r.id)?.path).toBeNull();
  });
});
