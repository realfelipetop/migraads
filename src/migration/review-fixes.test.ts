import { describe, expect, it } from "vitest";
import { loadSavedMappings, saveMappings } from "./mappings-store";
import { diagnose } from "./precheck";
import { endPlanning, markRunning, markStopped, tryStartPlanning } from "./events";
import type { SnapshotData } from "./snapshot";

describe("correções da revisão", () => {
  it("'remover público' não fica salvo para as próximas migrações", () => {
    saveMappings("act_rev", { pixel: { "1": "2" }, audience: { "10": "__remove__", "11": "12" } });
    expect(loadSavedMappings("act_rev")).toEqual({ pixel: { "1": "2" }, audience: { "11": "12" } });
  });

  it("trava de planejamento: não revisa duas vezes nem enquanto migra", () => {
    expect(tryStartPlanning("m-x")).toBe(true);
    expect(tryStartPlanning("m-x")).toBe(false);
    endPlanning("m-x");
    markRunning("m-y");
    expect(tryStartPlanning("m-y")).toBe(false);
    markStopped("m-y");
    expect(tryStartPlanning("m-y")).toBe(true);
    endPlanning("m-y");
  });

  it("limite de gastos considera as cópias (10 × R$ 182 > R$ 1.000 restantes)", async () => {
    const snap: SnapshotData = { campaign: { id: "c", daily_budget: "18200" }, adsets: [], ads: [] };
    const graph = {
      get: async <T,>(p: string) =>
        (p === "act_d"
          ? { account_id: "d", account_status: 1, currency: "BRL", timezone_name: "X", spend_cap: "100000", amount_spent: "0", funding_source_details: {} }
          : { account_id: "s", account_status: 1, currency: "BRL", timezone_name: "X" }) as T,
      getAll: async <T,>() => [] as T[],
    } as unknown as Parameters<typeof diagnose>[0];
    const one = await diagnose(graph, "act_s", "act_d", [snap], {}, undefined, { copies: 1 });
    const ten = await diagnose(graph, "act_s", "act_d", [snap], {}, undefined, { copies: 10 });
    expect(one.checks.find((c) => c.id === "spend_cap")?.level).toBe("ok");
    expect(ten.checks.find((c) => c.id === "spend_cap")?.level).toBe("warn");
  });
});
