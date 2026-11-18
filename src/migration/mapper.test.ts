import { describe, expect, it } from "vitest";
import { convertMinor, copySuffix, mapAd, mapAdset, mapCampaign, mapCreative, manualReasonFor, sanitizeDof } from "./mapper";

// Formatos reais da PRODUTO X (Fase 0), com dados de contato trocados por falsos.
const campaign = {
  id: "c1",
  name: "VENDAS - PRODUTO X - 28-06",
  objective: "OUTCOME_SALES",
  buying_type: "AUCTION",
  bid_strategy: "LOWEST_COST_WITH_BID_CAP",
  daily_budget: "18200",
  special_ad_categories: [],
  smart_promotion_type: "GUIDED_CREATION",
  advantage_state_info: { advantage_state: "DISABLED" },
};

const adset = {
  id: "s1",
  name: "CONJ1 - ABERTO",
  optimization_goal: "OFFSITE_CONVERSIONS",
  optimization_sub_event: "NONE",
  billing_event: "IMPRESSIONS",
  bid_amount: 4000,
  destination_type: "WEBSITE_AND_PHONE_CALL",
  start_time: "2026-06-27T16:50:00-0200",
  multi_optimization_goal_weight: "UNDEFINED",
  promoted_object: { pixel_id: "999", custom_event_type: "PURCHASE", smart_pse_enabled: false },
  attribution_spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }],
  targeting: {
    geo_locations: { countries: ["BR"] },
    instagram_positions: ["stream", "story", "explore", "reels", "explore_home"],
    targeting_automation: { advantage_audience: 1 },
  },
};

const ad = {
  id: "a1",
  name: "AD21",
  tracking_specs: [
    { "action.type": ["offsite_conversion"], fb_pixel: ["999"] },
    { "action.type": ["onsite_conversion"], conversion_id: ["777"] },
  ],
  creative: {
    id: "cr1",
    name: "Criativo",
    effective_object_story_id: "111_222",
    instagram_user_id: "333",
    contextual_multi_ads: { enroll_status: "OPT_IN" },
    asset_feed_spec: { call_ads_configuration: { call_destination_type: "WEBSITE_AND_CALL", phone_number: "tel:+550000000000" } },
    degrees_of_freedom_spec: {
      creative_features_spec: {
        image_animation: { enroll_status: "OPT_IN" },
        standard_enhancements: { enroll_status: "OPT_IN" },
        pac_relaxation: { enroll_status: "OPT_IN" },
      },
    },
  },
};

describe("campanha", () => {
  it("copia orçamento e bid cap, cria pausada com sufixo e não manda o marcador do Gerenciador", () => {
    const { payload, warnings } = mapCampaign(campaign, { suffix: " [MIGRA]", status: "PAUSED" });
    expect(payload).toEqual({
      name: "VENDAS - PRODUTO X - 28-06 [MIGRA]",
      objective: "OUTCOME_SALES",
      status: "PAUSED",
      special_ad_categories: [],
      buying_type: "AUCTION",
      daily_budget: "18200",
      bid_strategy: "LOWEST_COST_WITH_BID_CAP",
    });
    expect(warnings).toEqual([]);
  });

  it("sem orçamento na campanha (ABO) manda is_adset_budget_sharing_enabled", () => {
    const { payload } = mapCampaign({ ...campaign, daily_budget: undefined }, { suffix: "", status: "PAUSED" });
    expect(payload.is_adset_budget_sharing_enabled).toBe(false);
    expect(payload).not.toHaveProperty("bid_strategy");
  });
});

describe("conjunto", () => {
  const { payload, warnings } = mapAdset(adset, campaign, { newCampaignId: "N1", status: "PAUSED" });

  it("remove o posicionamento Explorar (descontinuado) e avisa", () => {
    expect((payload.targeting as { instagram_positions: string[] }).instagram_positions).toEqual(["stream", "story", "reels", "explore_home"]);
    expect(warnings.join()).toMatch(/Explorar do Instagram/);
  });

  it("mantém lance, pixel, evento, atribuição e destino; tira start_time e valores 'vazios'", () => {
    expect(payload).toMatchObject({
      campaign_id: "N1",
      bid_amount: 4000,
      promoted_object: { pixel_id: "999", custom_event_type: "PURCHASE" },
      destination_type: "WEBSITE_AND_PHONE_CALL",
    });
    expect(payload.promoted_object).not.toHaveProperty("smart_pse_enabled");
    expect(payload).not.toHaveProperty("start_time");
    expect(payload).not.toHaveProperty("optimization_sub_event");
    expect(payload).not.toHaveProperty("multi_optimization_goal_weight");
    // Orçamento é da campanha (CBO): não vai no conjunto.
    expect(payload).not.toHaveProperty("daily_budget");
  });
});

describe("criativo (caminho A: mesmo post)", () => {
  const r = mapCreative(ad, { suffix: " [MIGRA]" });

  it("reaproveita o post e o Instagram", () => {
    if ("manual" in r) throw new Error("não devia ser manual");
    expect(r.payload).toMatchObject({ object_story_id: "111_222", instagram_user_id: "333" });
  });

  it("tira o pacote de melhorias descontinuado e as pac_*, mantém as individuais", () => {
    if ("manual" in r) throw new Error();
    expect(r.payload.degrees_of_freedom_spec).toEqual({
      creative_features_spec: { image_animation: { enroll_status: "OPT_IN" } },
    });
    expect(r.warnings.join()).toMatch(/melhorias padrão/);
  });

  it("leva só a configuração do botão Ligar do asset_feed_spec", () => {
    if ("manual" in r) throw new Error();
    expect(Object.keys(r.payload.asset_feed_spec as object)).toEqual(["call_ads_configuration"]);
  });

  it("sem post → migrar manualmente", () => {
    expect(mapCreative({ name: "x", creative: {} }, { suffix: "" })).toHaveProperty("manual");
  });

  it("sobra nada nas melhorias → não manda o campo", () => {
    expect(sanitizeDof({ creative_features_spec: { standard_enhancements: {} } }, true, [])).toBeUndefined();
  });
});

describe("anúncio", () => {
  it("monitorização só com o pixel e status escolhido", () => {
    const { payload } = mapAd(ad, { newAdsetId: "S2", creativeId: "CR2", status: "PAUSED" });
    expect(payload).toEqual({
      name: "AD21",
      adset_id: "S2",
      creative: { creative_id: "CR2" },
      status: "PAUSED",
      tracking_specs: [{ "action.type": ["offsite_conversion"], fb_pixel: ["999"] }],
    });
  });
});

describe("erros que viram 'migrar manualmente'", () => {
  it("post multi-formato e criativo novo com app em desenvolvimento", () => {
    expect(manualReasonFor(100, 1815017)).toMatch(/multi-formato/);
    expect(manualReasonFor(100, 1885183)).toMatch(/modo público/);
    expect(manualReasonFor(100, 123)).toBeUndefined();
  });
});

describe("sufixo das cópias (multiplicar)", () => {
  it("1 cópia: sufixo como está", () => expect(copySuffix(" [MIGRA]", 1, 1)).toBe(" [MIGRA]"));
  it("várias cópias sem {n}: acrescenta [Cn]", () => expect(copySuffix(" [MIGRA]", 3, 2)).toBe(" [MIGRA] [C2]"));
  it("com {n}: usa o modelo da pessoa", () => expect(copySuffix(" - CBO {n}", 5, 4)).toBe(" - CBO 4"));
  it("sufixo vazio com várias cópias", () => expect(copySuffix("", 2, 2)).toBe(" [C2]"));
});

describe("mapeamentos para outra BM (Fase 6)", () => {
  const mappings = {
    pixel: { "999": "888" },
    custom_conversion: { cc1: "cc2" },
    audience: { aud1: "aud9", aud2: "__remove__" },
    instagram: { "333": "444" },
  };

  it("troca o pixel no conjunto e na monitorização do anúncio", () => {
    const s = mapAdset(adset, campaign, { newCampaignId: "N", status: "PAUSED", mappings });
    expect(s.payload.promoted_object).toEqual({ pixel_id: "888", custom_event_type: "PURCHASE" });
    const a = mapAd(ad, { newAdsetId: "S", creativeId: "C", status: "PAUSED", mappings });
    expect(a.payload.tracking_specs).toEqual([{ "action.type": ["offsite_conversion"], fb_pixel: ["888"] }]);
  });

  it("troca conversão personalizada e públicos; remove o público marcado e avisa", () => {
    const withAud = {
      ...adset,
      promoted_object: { pixel_id: "999", custom_conversion_id: "cc1" },
      targeting: {
        custom_audiences: [{ id: "aud1", name: "Compradores" }, { id: "aud2", name: "Visitantes" }],
        excluded_custom_audiences: [{ id: "aud2", name: "Visitantes" }],
      },
    };
    const { payload, warnings } = mapAdset(withAud, campaign, { newCampaignId: "N", status: "PAUSED", mappings });
    expect((payload.promoted_object as Record<string, unknown>).custom_conversion_id).toBe("cc2");
    expect(payload.targeting).toEqual({ custom_audiences: [{ id: "aud9" }] });
    expect(warnings.join()).toMatch(/Visitantes/);
  });

  it("troca a conta do Instagram do criativo", () => {
    const r = mapCreative(ad, { suffix: "", mappings });
    if ("manual" in r) throw new Error();
    expect(r.payload.instagram_user_id).toBe("444");
  });

  it("sem mapeamento, nada muda", () => {
    const s = mapAdset(adset, campaign, { newCampaignId: "N", status: "PAUSED" });
    expect((s.payload.promoted_object as Record<string, unknown>).pixel_id).toBe("999");
  });
});

describe("moeda diferente", () => {
  const currency = { from: "BRL", to: "USD", rate: 0.18 };

  it("converte orçamento da campanha e lance do conjunto (em centavos)", () => {
    const c = mapCampaign(campaign, { suffix: "", status: "PAUSED", mappings: { currency } });
    expect(c.payload.daily_budget).toBe("3276"); // R$ 182,00 × 0,18 = US$ 32,76
    const s = mapAdset(adset, campaign, { newCampaignId: "N", status: "PAUSED", mappings: { currency } });
    expect(s.payload.bid_amount).toBe(720); // R$ 40,00 → US$ 7,20 (mantém número)
  });

  it("moeda sem centavos (JPY) e mesma moeda", () => {
    expect(convertMinor("18200", { from: "BRL", to: "JPY", rate: 28 })).toBe("5096"); // R$ 182 → ¥ 5.096
    expect(convertMinor("18200", { from: "BRL", to: "BRL", rate: 1 })).toBe("18200");
  });
});
