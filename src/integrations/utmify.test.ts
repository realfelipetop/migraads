import { describe, expect, it } from "vitest";
import { fetchSummary, getUtmifyConfig, periodRange, removeUtmifyConfig, saveUtmifyConfig } from "./utmify";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";

const cfg = { apiKey: "chave-secreta-utmify", dashboardId: "658d716f7e39b6ea213da344" };

describe("API oficial da Utmify", () => {
  it("POST no resumo, com Bearer e filtro por conta de anúncios", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ currency: "BRL", orders: { approved: 114 }, revenue: { net: 1927000 }, ads: { spend: 553739 }, result: { roas: 3.48 } }));
    }) as unknown as typeof fetch;
    const s = await fetchSummary(cfg, { from: "2026-10-13T00:00:00-03:00", to: "2026-11-11T23:59:59-03:00", metaAdAccountIds: ["act_1"] }, fake);
    expect(seen!.url).toBe("https://query-api.utmify.com.br/public-api/v1/dashboards/658d716f7e39b6ea213da344/summary");
    expect(seen!.init.method).toBe("POST");
    expect((seen!.init.headers as Record<string, string>).authorization).toBe("Bearer chave-secreta-utmify");
    expect(JSON.parse(String(seen!.init.body)).metaAdAccountIds).toEqual(["act_1"]);
    expect(s.orders.approved).toBe(114);
  });

  it.each([
    [403, "OFFICIAL_API_REQUIRES_ELIGIBLE_PLAN", /Monster, Scale ou Enterprise/],
    [403, "OFFICIAL_API_NOT_AVAILABLE_FOR_USER", /beta fechado/],
    [429, "RATE_LIMIT_EXCEEDED", /Espere um minuto/],
    [401, "", /recusou a chave/],
  ])("erro %i %s vira mensagem em português", async (status, reason, msg) => {
    const fake = (async () => new Response(JSON.stringify({ result: "ERROR", reason, data: {} }), { status })) as unknown as typeof fetch;
    await expect(fetchSummary(cfg, {}, fake)).rejects.toThrow(msg);
  });

  it("chave guardada criptografada", () => {
    saveUtmifyConfig(cfg);
    const raw = JSON.stringify(getDb().select().from(schema.settings).where(eq(schema.settings.key, "utmify")).get());
    expect(raw).not.toContain(cfg.apiKey);
    expect(getUtmifyConfig()).toEqual(cfg);
    removeUtmifyConfig();
    expect(getUtmifyConfig()).toBeNull();
  });
});

describe("período do Explorador → intervalo da Utmify", () => {
  const now = new Date(2026, 10, 12, 15, 0, 0); // 12/11/2026, horário local
  it("últimos 30 dias = 13/10 a 11/11 (sem hoje, como a Meta)", () => {
    const r = periodRange("last_30d", now);
    expect(r.from?.slice(0, 19)).toBe("2026-10-13T00:00:00");
    expect(r.to?.slice(0, 19)).toBe("2026-11-11T23:59:59");
    expect(r.from).toMatch(/[+-]\d{2}:\d{2}$/); // sempre com fuso explícito
  });
  it("hoje, mês passado e máximo", () => {
    expect(periodRange("today", now).from?.slice(0, 10)).toBe("2026-11-12");
    expect(periodRange("last_month", now).to?.slice(0, 10)).toBe("2026-10-31");
    expect(periodRange("maximum", now)).toEqual({});
  });
});
