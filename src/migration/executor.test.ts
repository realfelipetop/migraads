import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { GraphError } from "@/meta/graph";
import { getItems, getMigration, updateMigration } from "@/meta/migrations";
import { buildPlan } from "./planner";
import { runMigration, type Poster } from "./executor";
import { requestPause } from "./events";
import type { SnapshotData } from "./snapshot";

const DEST = "act_999";
const NO_ISSUES = {
  checks: [],
  needs: [],
  candidates: { pixel: [], custom_conversion: [], audience: [], instagram: [] },
  currency: { source: "BRL", dest: "BRL" },
  blockedPages: [],
};

// Campanha no formato da PRODUTO X: CBO + bid cap, 1 conjunto, anúncios reaproveitando posts.
const data: SnapshotData = {
  campaign: { id: "c1", name: "PRODUTO X", objective: "OUTCOME_SALES", daily_budget: "18200", bid_strategy: "LOWEST_COST_WITH_BID_CAP" },
  adsets: [
    {
      id: "s1",
      name: "CONJ1",
      optimization_goal: "OFFSITE_CONVERSIONS",
      billing_event: "IMPRESSIONS",
      bid_amount: 4000,
      targeting: { instagram_positions: ["stream", "explore"] },
    },
  ],
  ads: [
    { id: "a1", name: "AD01", adset_id: "s1", creative: { effective_object_story_id: "p1" } },
    { id: "a2", name: "AD02", adset_id: "s1", creative: { effective_object_story_id: "p1" } }, // mesmo post do AD01
    { id: "a3", name: "AD03", adset_id: "s1", creative: { effective_object_story_id: "p3" } }, // post multi-formato
    { id: "a4", name: "AD04", adset_id: "s1", creative: { effective_object_story_id: "p4" } },
  ],
};

interface Created {
  id: string;
  edge: string;
  parent: string;
  name: unknown;
  creative?: { id: string };
  body: Record<string, unknown>;
}

/**
 * Meta falsa: guarda o que foi criado (como a real) e responde buscas por pai.
 * - networkFailAt: a internet cai ANTES da chamada n chegar na Meta.
 * - crashAfterCreateAt: a Meta CRIA o objeto da chamada n, mas a resposta não volta (app cai).
 * Passe `world` para a retomada enxergar o que a execução anterior deixou na "Meta".
 */
function fakeMeta(opts: { networkFailAt?: number; crashAfterCreateAt?: number; campaignInvalid?: boolean; world?: Created[] } = {}) {
  const world = opts.world ?? [];
  // IDs únicos por "Meta" (como os reais): testes diferentes nunca geram o mesmo ID.
  const uid = opts.world?.[0]?.id.split("_")[1] ?? Math.random().toString(36).slice(2, 8);
  const calls: Created[] = [];
  let n = 0;
  const parentOf = (edge: string, body: Record<string, unknown>) =>
    edge === "adsets" ? String(body.campaign_id) : edge === "ads" ? String(body.adset_id) : DEST;
  const poster: Poster = {
    async post<T>(path: string, body: Record<string, unknown>) {
      n++;
      const edge = path.split("/")[1];
      if (n === opts.networkFailAt) throw new GraphError("Falha de rede ao falar com a Meta: fetch failed", 0);
      if (edge === "campaigns" && opts.campaignInvalid) throw new GraphError("Invalid parameter", 400, 100, 1);
      if (edge === "adcreatives" && body.object_story_id === "p3") throw new GraphError("Invalid parameter", 400, 100, 1815017);
      const obj: Created = {
        id: `${edge}_${uid}_${world.length + 1}`,
        edge,
        parent: parentOf(edge, body),
        name: body.name,
        creative: edge === "ads" ? { id: String((body.creative as { creative_id: string }).creative_id) } : undefined,
        body,
      };
      world.push(obj);
      calls.push(obj);
      if (n === opts.crashAfterCreateAt) throw new GraphError("Falha de rede ao falar com a Meta: socket hang up", 0);
      return { id: obj.id } as T;
    },
    async getAll<T>(path: string) {
      const [parent, edge] = path.split("/");
      return world.filter((o) => o.edge === edge && o.parent === parent).map((o) => ({ id: o.id, name: o.name, creative: o.creative })) as T[];
    },
  };
  return { poster, calls, world, count: (edge: string) => calls.filter((c) => c.edge === edge).length };
}

function newMigration(copies = 1): string {
  const db = getDb();
  const snap = db
    .insert(schema.snapshots)
    .values({ sourceAccountId: "act_1", campaignId: "c1", campaignName: "PRODUTO X", apiVersion: "v26.0", data })
    .returning()
    .get();
  const m = db
    .insert(schema.migrations)
    .values({
      sourceAccountId: "act_1",
      destAccountId: DEST,
      status: "planned",
      options: { selection: { campaigns: ["c1"], adsets: [], ads: [], excluded: [] }, snapshotIds: [snap.id], suffix: " [MIGRA]", createStatus: "PAUSED", copies },
    })
    .returning()
    .get();
  const plan = buildPlan(m.id, [{ id: snap.id, data }], { suffix: " [MIGRA]", createStatus: "PAUSED", copies }, NO_ISSUES);
  updateMigration(m.id, { summaryPatch: { plan } });
  return m.id;
}

describe("executor", () => {
  let id: string;
  beforeEach(() => {
    id = newMigration();
  });

  it("cria tudo pausado, na ordem, compartilhando o criativo do mesmo post", async () => {
    const meta = fakeMeta();
    expect(await runMigration(id, meta.poster)).toBe("done_with_issues"); // AD03 vira "migrar manualmente"
    expect(meta.calls.map((c) => c.edge)).toEqual(["campaigns", "adsets", "adcreatives", "ads", "ads", "adcreatives", "ads"]);
    expect(meta.calls.every((c) => c.body.status === undefined || c.body.status === "PAUSED")).toBe(true);
    const items = getItems(id);
    expect(items.find((i) => i.sourceId === "a3")).toMatchObject({ status: "manual" });
    expect(items.filter((i) => i.status === "done")).toHaveLength(5);
    // O conjunto saiu sem o posicionamento descontinuado.
    expect(meta.calls[1].body.targeting).toEqual({ instagram_positions: ["stream"] });
  });

  it("cai a internet no meio → pausa; retomar termina SEM DUPLICAR nada", async () => {
    const first = fakeMeta({ networkFailAt: 4 }); // cai ao criar o 1º anúncio
    expect(await runMigration(id, first.poster)).toBe("paused");
    expect(getMigration(id)?.run?.message).toMatch(/Sem conexão/);
    expect(first.count("campaigns")).toBe(1);

    const second = fakeMeta();
    expect(await runMigration(id, second.poster)).toBe("done_with_issues");
    // Na retomada, campanha, conjunto e criativo do post p1 NÃO são criados de novo.
    expect(second.count("campaigns")).toBe(0);
    expect(second.count("adsets")).toBe(0);
    expect(first.count("ads") + second.count("ads")).toBe(3);
    expect(first.count("adcreatives") + second.count("adcreatives")).toBe(2);
  });

  it("o app cai LOGO DEPOIS de a Meta criar (caso real do teste da Fase 4) → retomar adota, não duplica", async () => {
    // Chamadas: 1 campanha, 2 conjunto, 3 criativo p1, 4 anúncio AD01 ← a Meta cria, mas a resposta se perde.
    const first = fakeMeta({ crashAfterCreateAt: 4 });
    expect(await runMigration(id, first.poster)).toBe("paused");
    expect(first.world.filter((o) => o.edge === "ads")).toHaveLength(1); // o AD01 existe na "Meta"

    const second = fakeMeta({ world: first.world });
    expect(await runMigration(id, second.poster)).toBe("done_with_issues");
    const ads = second.world.filter((o) => o.edge === "ads");
    expect(ads.map((a) => a.name).sort()).toEqual(["AD01", "AD02", "AD04"]); // nenhum repetido
    expect(getItems(id).find((i) => i.sourceId === "a1")).toMatchObject({ status: "done", destId: ads[0].id });
  });

  it("pausa pedida pelo usuário para antes do próximo item", async () => {
    requestPause(id);
    expect(await runMigration(id, fakeMeta().poster)).toBe("paused");
    expect(getItems(id).every((i) => i.status !== "done")).toBe(true);
  });

  it("se a campanha for recusada, os filhos esperam e a migração falha", async () => {
    expect(await runMigration(id, fakeMeta({ campaignInvalid: true }).poster)).toBe("failed");
    const items = getItems(id);
    expect(items.find((i) => i.level === "adset")?.error).toMatch(/campanha não foi criada/);
  });

  it("multiplicar: 3 cópias → 3 campanhas com [C1..C3], cada uma completa, criativos compartilhados", async () => {
    const mid = newMigration(3);
    const meta = fakeMeta();
    expect(await runMigration(mid, meta.poster)).toBe("done_with_issues");
    expect(meta.calls.filter((c) => c.edge === "campaigns").map((c) => c.name)).toEqual([
      "PRODUTO X [MIGRA] [C1]",
      "PRODUTO X [MIGRA] [C2]",
      "PRODUTO X [MIGRA] [C3]",
    ]);
    expect(meta.count("adsets")).toBe(3);
    expect(meta.count("ads")).toBe(9); // AD01, AD02, AD04 × 3 (AD03 é manual)
    expect(meta.count("adcreatives")).toBe(2); // um por post (p1, p4), usado nas 3 cópias
    // Cada conjunto pertence à sua campanha, e cada anúncio ao seu conjunto.
    const campIds = meta.calls.filter((c) => c.edge === "campaigns").map((c) => c.id);
    const adsets = meta.calls.filter((c) => c.edge === "adsets");
    expect(adsets.map((a) => a.parent)).toEqual(campIds);
    for (const a of adsets) expect(meta.calls.filter((c) => c.edge === "ads" && c.parent === a.id)).toHaveLength(3);
  });

  it("multiplicar + queda no meio da cópia 2 → retomar não duplica nenhuma cópia", async () => {
    const mid = newMigration(3);
    const first = fakeMeta({ crashAfterCreateAt: 8 }); // 3 campanhas, 3 conjuntos, 1 criativo, cai criando o 1º anúncio
    expect(await runMigration(mid, first.poster)).toBe("paused");
    const second = fakeMeta({ world: first.world });
    expect(await runMigration(mid, second.poster)).toBe("done_with_issues");
    const w = second.world;
    expect(w.filter((o) => o.edge === "campaigns")).toHaveLength(3);
    expect(w.filter((o) => o.edge === "adsets")).toHaveLength(3);
    expect(w.filter((o) => o.edge === "ads")).toHaveLength(9);
  });

  it("revisão: queda/token expirado AO CRIAR O CRIATIVO pausa a migração (não marca anúncios como erro)", async () => {
    const meta = fakeMeta({ networkFailAt: 3 }); // 1 campanha, 2 conjunto, 3 criativo ← cai
    expect(await runMigration(id, meta.poster)).toBe("paused");
    expect(getItems(id).filter((i) => i.status === "failed")).toHaveLength(0);
  });

  it("revisão: mesmo post com UTMs diferentes → criativos diferentes (cada anúncio com as suas UTMs)", async () => {
    const db = getDb();
    const snap = db
      .insert(schema.snapshots)
      .values({
        sourceAccountId: "act_1",
        campaignId: "c1",
        campaignName: "PRODUTO X",
        apiVersion: "v26.0",
        data: {
          ...data,
          ads: [
            { id: "u1", name: "AD-UTM-A", adset_id: "s1", creative: { effective_object_story_id: "p1", url_tags: "utm_content=a" } },
            { id: "u2", name: "AD-UTM-B", adset_id: "s1", creative: { effective_object_story_id: "p1", url_tags: "utm_content=b" } },
            { id: "u3", name: "AD-UTM-A2", adset_id: "s1", creative: { effective_object_story_id: "p1", url_tags: "utm_content=a" } },
          ],
        },
      })
      .returning()
      .get();
    const m = db
      .insert(schema.migrations)
      .values({ sourceAccountId: "act_1", destAccountId: DEST, status: "planned", options: { selection: { campaigns: ["c1"], adsets: [], ads: [], excluded: [] }, snapshotIds: [snap.id], suffix: "", createStatus: "PAUSED" } })
      .returning()
      .get();
    buildPlan(m.id, [{ id: snap.id, data: snap.data as SnapshotData }], { suffix: "", createStatus: "PAUSED" }, NO_ISSUES);
    const meta = fakeMeta();
    await runMigration(m.id, meta.poster);
    const creatives = meta.calls.filter((c) => c.edge === "adcreatives").map((c) => c.body.url_tags);
    expect(creatives).toEqual(["utm_content=a", "utm_content=b"]); // A e A2 compartilham; B tem o seu
  });

  it("revisão: retomar NÃO adota objetos de outra migração com o mesmo nome", async () => {
    const a = id;
    const b = newMigration();
    const first = fakeMeta({ networkFailAt: 1 }); // A cai antes de criar a campanha
    expect(await runMigration(a, first.poster)).toBe("paused");
    const world = first.world;
    expect(await runMigration(b, fakeMeta({ world }).poster)).toBe("done_with_issues"); // B cria tudo, mesmos nomes
    expect(await runMigration(a, fakeMeta({ world }).poster)).toBe("done_with_issues"); // A retoma
    expect(world.filter((o) => o.edge === "campaigns")).toHaveLength(2); // uma de cada, nada "roubado"
    expect(world.filter((o) => o.edge === "ads")).toHaveLength(6);
  });
});
