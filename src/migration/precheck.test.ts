import { describe, expect, it } from "vitest";
import { diagnose, restrictionNotice } from "./precheck";
import type { SnapshotData } from "./snapshot";

const snap: SnapshotData = {
  campaign: { id: "c1", daily_budget: "18200" },
  adsets: [
    {
      id: "s1",
      promoted_object: { pixel_id: "PX1", custom_event_type: "PURCHASE" },
      targeting: { custom_audiences: [{ id: "111", name: "Compradores 180D" }] },
    },
  ],
  ads: [
    { id: "a1", creative: { effective_object_story_id: "PAGE1_10", instagram_user_id: "IG1" }, tracking_specs: [{ fb_pixel: ["PX1"] }] },
    { id: "a2", creative: { effective_object_story_id: "PAGE2_20" } },
  ],
};

/** Meta falsa: destino em outra BM, sem o pixel nem o público da origem. */
function reader(over: { destCurrency?: string; spendCap?: string; spent?: string } = {}) {
  const accounts: Record<string, object> = {
    act_src: { account_id: "src", account_status: 1, currency: "BRL", timezone_name: "America/Sao_Paulo" },
    act_dst: {
      account_id: "dst",
      account_status: 1,
      currency: over.destCurrency ?? "BRL",
      timezone_name: "America/Sao_Paulo",
      spend_cap: over.spendCap ?? "0",
      amount_spent: over.spent ?? "0",
      funding_source_details: { id: "x" },
    },
  };
  const lists: Record<string, object[]> = {
    "act_dst/adspixels": [{ id: "PX9", name: "Outro pixel" }],
    "act_dst/customaudiences": [{ id: "999", name: "Compradores (destino)" }],
    "me/accounts": [
      { id: "PAGE1", name: "Minha Loja", tasks: ["ADVERTISE", "MANAGE"] },
      { id: "PAGE2", name: "Sem permissão", tasks: ["ANALYZE"] },
    ],
    "act_dst/instagram_accounts": [{ id: "IG1", username: "minhaloja" }],
  };
  return {
    get: async <T,>(path: string) => accounts[path] as T,
    getAll: async <T,>(path: string) => (lists[path] ?? []) as T[],
  } as unknown as Parameters<typeof diagnose>[0];
}

const level = (d: Awaited<ReturnType<typeof diagnose>>, id: string) => d.checks.find((c) => c.id === id)?.level;

describe("diagnóstico do destino (§9)", () => {
  it("outra BM sem o pixel → vermelho, com o pixel do destino como opção", async () => {
    const d = await diagnose(reader(), "act_src", "act_dst", [snap]);
    expect(level(d, "pixel")).toBe("block");
    expect(d.candidates.pixel).toEqual([{ id: "PX9", name: "Outro pixel" }]);
    expect(d.needs.find((n) => n.kind === "pixel")).toMatchObject({ id: "PX1", available: false, usedBy: 2 });
  });

  it("depois de mapear o pixel → verde", async () => {
    const d = await diagnose(reader(), "act_src", "act_dst", [snap], { pixel: { PX1: "PX9" }, audience: { "111": "999" } });
    expect(level(d, "pixel")).toBe("ok");
    expect(level(d, "audience")).toBe("ok");
  });

  it("público que não existe no destino → vermelho até trocar ou remover", async () => {
    expect(level(await diagnose(reader(), "act_src", "act_dst", [snap]), "audience")).toBe("block");
    const removed = await diagnose(reader(), "act_src", "act_dst", [snap], { audience: { "111": "__remove__" } });
    expect(level(removed, "audience")).toBe("ok");
  });

  it("página sem permissão de anunciar → aviso, e os anúncios dela vão para manual", async () => {
    const d = await diagnose(reader(), "act_src", "act_dst", [snap]);
    expect(level(d, "page")).toBe("warn");
    expect(d.blockedPages).toEqual(["PAGE2"]);
  });

  it("moeda diferente → bloqueia até informar a conversão", async () => {
    expect(level(await diagnose(reader({ destCurrency: "USD" }), "act_src", "act_dst", [snap]), "currency")).toBe("block");
    const ok = await diagnose(reader({ destCurrency: "USD" }), "act_src", "act_dst", [snap], { currency: { from: "BRL", to: "USD", rate: 0.18 } });
    expect(level(ok, "currency")).toBe("ok");
  });

  it("limite de gastos quase no fim (caso real: sobravam R$ 0,53) → aviso", async () => {
    const d = await diagnose(reader({ spendCap: "62692", spent: "62639" }), "act_src", "act_dst", [snap]);
    expect(level(d, "spend_cap")).toBe("warn");
    expect(d.checks.find((c) => c.id === "spend_cap")?.detail).toMatch(/0,53/);
  });

  it("aviso de restrição só para conta de origem não ativa", () => {
    expect(restrictionNotice(1)).toBeNull();
    expect(restrictionNotice(2)).toMatch(/violação de política/);
  });
});
