import { describe, expect, it } from "vitest";
import { computeMetrics, formatMoney, fromMinor } from "./metrics";

describe("métricas no formato do Gerenciador", () => {
  // Números reais da campanha "PRODUTO X" nos últimos 30 dias (conferidos com o print do Gerenciador).
  const campanha = {
    spend: "5537.39",
    reach: "47889",
    impressions: "227000",
    actions: [
      { action_type: "link_click", value: "3100" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "114" },
      { action_type: "omni_purchase", value: "114" },
    ],
    purchase_roas: [{ action_type: "omni_purchase", value: "3.48" }],
  };

  it("vendas: resultado = compras, custo por compra e ROAS", () => {
    const m = computeMetrics(campanha, "OUTCOME_SALES");
    expect(m.results).toBe(114);
    expect(m.resultLabel).toBe("Compras");
    expect(m.costPerResult).toBeCloseTo(48.57, 2);
    expect(m.roas).toBeCloseTo(3.48);
  });

  it("leads: prioriza leads mesmo havendo cliques", () => {
    const m = computeMetrics(
      { spend: "100", actions: [{ action_type: "link_click", value: "50" }, { action_type: "lead", value: "10" }] },
      "OUTCOME_LEADS",
    );
    expect(m.resultLabel).toBe("Leads");
    expect(m.costPerResult).toBe(10);
  });

  it("ROAS calculado pelo valor das compras quando a Meta não manda pronto", () => {
    const m = computeMetrics({ spend: "100", action_values: [{ action_type: "purchase", value: "250" }] });
    expect(m.roas).toBe(2.5);
  });

  it("sem dados no período", () => {
    expect(computeMetrics(undefined)).toMatchObject({ spend: 0, results: null, costPerResult: null, roas: null });
  });

  it("orçamento vem em centavos (exceto moedas sem centavos)", () => {
    expect(fromMinor("18200", "BRL")).toBe(182);
    expect(fromMinor("5000", "JPY")).toBe(5000);
    expect(formatMoney(182, "BRL")).toMatch(/^R\$\s182,00$/); // Intl usa espaço não quebrável
  });
});
