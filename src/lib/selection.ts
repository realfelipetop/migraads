/**
 * Seleção em cascata do Explorador (PLANO §11.2). Funções puras, testadas.
 *
 * - Marcar uma campanha marca todos os conjuntos e anúncios dela.
 * - Dá para desmarcar filhos um por um (vira exceção).
 * - Marcar só alguns anúncios leva a campanha e o conjunto "pai" com eles dentro.
 * - Anúncios reprovados ficam DESMARCADOS por padrão, mesmo com o pai marcado.
 */

export interface Selection {
  campaigns: string[]; // campanha inteira
  adsets: string[]; // conjunto inteiro
  ads: string[]; // anúncio avulso
  excluded: string[]; // conjuntos/anúncios tirados de um pai marcado
}

export const emptySelection = (): Selection => ({ campaigns: [], adsets: [], ads: [], excluded: [] });

export interface Structure {
  campaign: { id: string; name: string; status: string };
  adsets: { id: string; name: string; status: string }[];
  ads: { id: string; name: string; status: string; adsetId: string }[];
}

export interface Parents {
  campaignId: string;
  adsetId?: string;
}

const has = (list: string[], id: string) => list.includes(id);
const without = (list: string[], ...ids: string[]) => list.filter((x) => !ids.includes(x));
const withId = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

export const isDisapproved = (status: string) => status === "DISAPPROVED";

/** O anúncio vai na migração? */
export function adIncluded(sel: Selection, ad: { id: string; status: string }, p: Required<Parents>): boolean {
  if (has(sel.ads, ad.id)) return true;
  if (has(sel.excluded, ad.id) || has(sel.excluded, p.adsetId)) return false;
  if (isDisapproved(ad.status)) return false;
  return has(sel.adsets, p.adsetId) || has(sel.campaigns, p.campaignId);
}

/** O conjunto vai inteiro (por ele mesmo ou pela campanha)? */
export function adsetWhole(sel: Selection, adsetId: string, campaignId: string): boolean {
  if (has(sel.excluded, adsetId)) return false;
  return has(sel.adsets, adsetId) || has(sel.campaigns, campaignId);
}

export function toggleCampaign(sel: Selection, campaignId: string, s?: Structure): Selection {
  const childIds = s ? [...s.adsets.map((x) => x.id), ...s.ads.map((x) => x.id)] : [];
  if (has(sel.campaigns, campaignId)) {
    return {
      campaigns: without(sel.campaigns, campaignId),
      adsets: without(sel.adsets, ...childIds),
      ads: without(sel.ads, ...childIds),
      excluded: without(sel.excluded, ...childIds),
    };
  }
  // Marcar a campanha limpa escolhas parciais dentro dela: tudo passa a ir.
  return {
    campaigns: [...sel.campaigns, campaignId],
    adsets: without(sel.adsets, ...childIds),
    ads: without(sel.ads, ...childIds),
    excluded: without(sel.excluded, ...childIds),
  };
}

export function toggleAdset(sel: Selection, adsetId: string, p: Parents, s?: Structure): Selection {
  const adIds = s ? s.ads.filter((a) => a.adsetId === adsetId).map((a) => a.id) : [];
  if (has(sel.campaigns, p.campaignId)) {
    // Pai marcado: o conjunto entra/sai como exceção.
    return has(sel.excluded, adsetId)
      ? { ...sel, excluded: without(sel.excluded, adsetId, ...adIds), ads: without(sel.ads, ...adIds) }
      : { ...sel, excluded: withId(without(sel.excluded, ...adIds), adsetId), ads: without(sel.ads, ...adIds) };
  }
  if (has(sel.adsets, adsetId)) {
    return { ...sel, adsets: without(sel.adsets, adsetId), ads: without(sel.ads, ...adIds), excluded: without(sel.excluded, ...adIds) };
  }
  return { ...sel, adsets: [...sel.adsets, adsetId], ads: without(sel.ads, ...adIds), excluded: without(sel.excluded, adsetId, ...adIds) };
}

export function toggleAd(sel: Selection, ad: { id: string; status: string }, p: Required<Parents>): Selection {
  if (adIncluded(sel, ad, p)) {
    if (has(sel.ads, ad.id)) {
      const next = { ...sel, ads: without(sel.ads, ad.id) };
      // Se ainda estiver incluído pelo pai, vira exceção.
      return adIncluded(next, ad, p) ? { ...next, excluded: withId(next.excluded, ad.id) } : next;
    }
    return { ...sel, excluded: withId(sel.excluded, ad.id) };
  }
  // Incluir: se o pai cobre (e o anúncio só estava excluído), basta tirar a exceção.
  const lifted = { ...sel, excluded: without(sel.excluded, ad.id) };
  return adIncluded(lifted, ad, p) ? lifted : { ...lifted, ads: [...lifted.ads, ad.id] };
}

export type CheckState = "checked" | "indeterminate" | "unchecked";

/** Estado do checkbox de uma campanha, olhando os anúncios dela. */
export function campaignCheck(sel: Selection, campaignId: string, s?: Structure): CheckState {
  if (!s) return has(sel.campaigns, campaignId) ? "checked" : "unchecked";
  const eligible = s.ads.filter((a) => !isDisapproved(a.status));
  const included = s.ads.filter((a) => adIncluded(sel, a, { campaignId, adsetId: a.adsetId }));
  if (has(sel.campaigns, campaignId) && included.length === eligible.length && !s.adsets.some((x) => has(sel.excluded, x.id)))
    return "checked";
  return included.length > 0 || s.adsets.some((x) => has(sel.adsets, x.id)) || has(sel.campaigns, campaignId)
    ? "indeterminate"
    : "unchecked";
}

export function adsetCheck(sel: Selection, adsetId: string, campaignId: string, s?: Structure): CheckState {
  const whole = adsetWhole(sel, adsetId, campaignId);
  if (!s) return whole ? "checked" : "unchecked";
  const ads = s.ads.filter((a) => a.adsetId === adsetId);
  const eligible = ads.filter((a) => !isDisapproved(a.status));
  const included = ads.filter((a) => adIncluded(sel, a, { campaignId, adsetId }));
  if (whole && included.length === eligible.length) return "checked";
  return included.length > 0 || whole ? "indeterminate" : "unchecked";
}

/** O que vai ser migrado, já resolvido em árvore (com os nomes), para salvar e revisar. */
export interface ResolvedCampaign {
  id: string;
  name: string;
  whole: boolean;
  adsets: { id: string; name: string; whole: boolean; ads: { id: string; name: string }[] }[];
  skippedDisapproved: number;
}

export function resolveSelection(sel: Selection, structures: Structure[]): ResolvedCampaign[] {
  const out: ResolvedCampaign[] = [];
  for (const s of structures) {
    const cId = s.campaign.id;
    const adsets = s.adsets
      .map((set) => {
        const ads = s.ads
          .filter((a) => a.adsetId === set.id)
          .filter((a) => adIncluded(sel, a, { campaignId: cId, adsetId: set.id }))
          .map((a) => ({ id: a.id, name: a.name }));
        const whole = adsetWhole(sel, set.id, cId);
        return { id: set.id, name: set.name, whole, ads };
      })
      .filter((set) => set.ads.length > 0 || (set.whole && !s.ads.some((a) => a.adsetId === set.id)));
    if (!adsets.length && !has(sel.campaigns, cId)) continue;
    const skippedDisapproved = has(sel.campaigns, cId) ? s.ads.filter((a) => isDisapproved(a.status) && !has(sel.ads, a.id)).length : 0;
    out.push({ id: cId, name: s.campaign.name, whole: campaignCheck(sel, cId, s) === "checked", adsets, skippedDisapproved });
  }
  return out;
}

export function countSelection(resolved: ResolvedCampaign[]) {
  return {
    campaigns: resolved.length,
    adsets: resolved.reduce((n, c) => n + c.adsets.length, 0),
    ads: resolved.reduce((n, c) => n + c.adsets.reduce((m, s) => m + s.ads.length, 0), 0),
    skippedDisapproved: resolved.reduce((n, c) => n + c.skippedDisapproved, 0),
  };
}

/** Campanhas envolvidas na seleção (para carregar a estrutura delas). */
export function campaignsInvolved(sel: Selection, parentOf: (id: string) => string | undefined): string[] {
  const set = new Set(sel.campaigns);
  for (const id of [...sel.adsets, ...sel.ads, ...sel.excluded]) {
    const c = parentOf(id);
    if (c) set.add(c);
  }
  return [...set];
}
