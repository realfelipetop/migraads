import { describe, expect, it } from "vitest";
import {
  adsetCheck,
  campaignCheck,
  countSelection,
  emptySelection,
  resolveSelection,
  toggleAd,
  toggleAdset,
  toggleCampaign,
  type Structure,
} from "./selection";

// Campanha parecida com a campanha "PRODUTO X": 2 conjuntos, 4 anúncios, 1 reprovado.
const S: Structure = {
  campaign: { id: "c1", name: "PRODUTO X", status: "ACTIVE" },
  adsets: [
    { id: "s1", name: "CONJ1", status: "ACTIVE" },
    { id: "s2", name: "CONJ2", status: "ACTIVE" },
  ],
  ads: [
    { id: "a1", name: "AD01", status: "ACTIVE", adsetId: "s1" },
    { id: "a2", name: "AD02", status: "PAUSED", adsetId: "s1" },
    { id: "a3", name: "AD03", status: "DISAPPROVED", adsetId: "s1" },
    { id: "a4", name: "AD04", status: "ACTIVE", adsetId: "s2" },
  ],
};
const ad = (id: string) => S.ads.find((a) => a.id === id)!;
const p = (id: string) => ({ campaignId: "c1", adsetId: ad(id).adsetId });
const adsOf = (sel: ReturnType<typeof emptySelection>) =>
  resolveSelection(sel, [S]).flatMap((c) => c.adsets.flatMap((s) => s.ads.map((a) => a.id)));

describe("seleção em cascata", () => {
  it("marcar a campanha leva tudo, menos o reprovado", () => {
    const sel = toggleCampaign(emptySelection(), "c1", S);
    expect(adsOf(sel)).toEqual(["a1", "a2", "a4"]);
    expect(countSelection(resolveSelection(sel, [S]))).toEqual({ campaigns: 1, adsets: 2, ads: 3, skippedDisapproved: 1 });
    expect(campaignCheck(sel, "c1", S)).toBe("checked");
  });

  it("desmarcar um anúncio com a campanha marcada vira exceção", () => {
    let sel = toggleCampaign(emptySelection(), "c1", S);
    sel = toggleAd(sel, ad("a2"), p("a2"));
    expect(adsOf(sel)).toEqual(["a1", "a4"]);
    expect(campaignCheck(sel, "c1", S)).toBe("indeterminate");
    expect(adsetCheck(sel, "s1", "c1", S)).toBe("indeterminate");
    // e marcar de novo volta ao normal
    sel = toggleAd(sel, ad("a2"), p("a2"));
    expect(campaignCheck(sel, "c1", S)).toBe("checked");
  });

  it("dá para incluir o reprovado de propósito", () => {
    let sel = toggleCampaign(emptySelection(), "c1", S);
    sel = toggleAd(sel, ad("a3"), p("a3"));
    expect(adsOf(sel)).toContain("a3");
  });

  it("tirar um conjunto inteiro da campanha marcada", () => {
    let sel = toggleCampaign(emptySelection(), "c1", S);
    sel = toggleAdset(sel, "s2", { campaignId: "c1" }, S);
    const r = resolveSelection(sel, [S]);
    expect(r[0].adsets.map((s) => s.id)).toEqual(["s1"]);
    expect(adsetCheck(sel, "s2", "c1", S)).toBe("unchecked");
  });

  it("marcar só um anúncio leva a campanha e o conjunto pai com ele", () => {
    const sel = toggleAd(emptySelection(), ad("a4"), p("a4"));
    const r = resolveSelection(sel, [S]);
    expect(r).toHaveLength(1);
    expect(r[0].whole).toBe(false);
    expect(r[0].adsets).toEqual([{ id: "s2", name: "CONJ2", whole: false, ads: [{ id: "a4", name: "AD04" }] }]);
    expect(campaignCheck(sel, "c1", S)).toBe("indeterminate");
  });

  it("marcar só um conjunto leva os anúncios dele", () => {
    const sel = toggleAdset(emptySelection(), "s1", { campaignId: "c1" }, S);
    expect(adsOf(sel)).toEqual(["a1", "a2"]);
    expect(adsetCheck(sel, "s1", "c1", S)).toBe("checked");
  });

  it("desmarcar a campanha limpa tudo dentro dela", () => {
    let sel = toggleCampaign(emptySelection(), "c1", S);
    sel = toggleAd(sel, ad("a2"), p("a2"));
    sel = toggleCampaign(sel, "c1", S);
    expect(sel).toEqual(emptySelection());
    expect(resolveSelection(sel, [S])).toEqual([]);
  });
});
