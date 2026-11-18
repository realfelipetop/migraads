/**
 * Tradutor origem → destino (PLANO §7), com as regras aprendidas na Fase 0.
 * Funções puras: recebem o objeto lido da origem e devolvem o payload de criação + avisos.
 *
 * Regras de atualização (Fase 0, achado 7) — campanhas antigas carregam coisas que a Meta
 * não aceita mais na CRIAÇÃO de objetos novos:
 *  - posicionamento "explore" do Instagram (descontinuado)
 *  - melhoria "standard_enhancements" (pacote descontinuado)
 *  - melhorias "pac_*" quando o criativo reaproveita o post (vira "criativo dinâmico" e é recusado)
 *  - smart_promotion_type (marcador do fluxo do Gerenciador) não é enviado
 *  - tracking_specs: só o pixel (conversões personalizadas são da conta de origem)
 */

export type Obj = Record<string, unknown>;
export type CreateStatus = "PAUSED" | "ACTIVE";

export interface MapResult {
  payload: Obj;
  warnings: string[];
}

const has = (v: unknown) => v !== undefined && v !== null && v !== "";
const pick = (obj: Obj, keys: string[]) => Object.fromEntries(keys.filter((k) => has(obj[k])).map((k) => [k, obj[k]]));

export const DEPRECATED_POSITIONS: Record<string, { value: string; label: string }[]> = {
  instagram_positions: [{ value: "explore", label: "Explorar do Instagram" }],
};

export const DROPPED_FEATURES: Record<string, string> = {
  standard_enhancements: "pacote “melhorias padrão”",
};

export const MAX_COPIES = 20;

/**
 * Mapeamentos origem → destino (Fase 6). Usados quando o destino é outra BM ou não enxerga
 * algum ativo. "__remove__" num público tira ele do conjunto.
 */
export interface Mappings {
  pixel?: Record<string, string>;
  custom_conversion?: Record<string, string>;
  audience?: Record<string, string>;
  instagram?: Record<string, string>;
  /** Conversão de moeda: 1 unidade da origem = `rate` unidades do destino. */
  currency?: { from: string; to: string; rate: number };
}

export const REMOVE = "__remove__";

/** Moedas sem centavos na API da Meta (valores vêm na unidade, não em centavos). */
const ZERO_DECIMAL = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);
const offset = (cur: string) => (ZERO_DECIMAL.has(cur) ? 1 : 100);

/** Converte um valor em "centavos" da moeda de origem para "centavos" da moeda de destino. */
export function convertMinor(value: unknown, c?: Mappings["currency"]): unknown {
  if (!c || !has(value) || c.from === c.to) return value;
  const major = (Number(value) / offset(c.from)) * c.rate;
  return String(Math.max(1, Math.round(major * offset(c.to))));
}

const MONEY_CAMPAIGN = ["daily_budget", "lifetime_budget", "spend_cap"];
const MONEY_ADSET = [
  "daily_budget", "lifetime_budget", "bid_amount", "daily_min_spend_target", "daily_spend_cap",
  "lifetime_min_spend_target", "lifetime_spend_cap",
];

function convertMoney(payload: Obj, fields: string[], c?: Mappings["currency"]) {
  if (!c || c.from === c.to) return;
  for (const f of fields) if (has(payload[f])) payload[f] = typeof payload[f] === "number" ? Number(convertMinor(payload[f], c)) : convertMinor(payload[f], c);
}

const mapId = (table: Record<string, string> | undefined, id: unknown) => (table && has(id) && table[String(id)]) || id;

/** Troca públicos personalizados (incluídos e excluídos) e remove os marcados como REMOVE. */
function mapAudiences(targeting: Record<string, unknown>, table: Record<string, string> | undefined, warnings: string[]) {
  if (!table) return;
  for (const field of ["custom_audiences", "excluded_custom_audiences"]) {
    const list = targeting[field];
    if (!Array.isArray(list)) continue;
    const next: Obj[] = [];
    for (const a of list as Obj[]) {
      const to = table[String(a.id)];
      if (to === REMOVE) {
        warnings.push(`Público “${a.name ?? a.id}” removido do conjunto (não existe no destino).`);
        continue;
      }
      next.push(to ? { id: to } : { id: a.id });
    }
    if (next.length) targeting[field] = next;
    else delete targeting[field];
  }
}

/**
 * Sufixo da cópia n (modo multiplicar). "{n}" vira o número da cópia.
 * Com mais de 1 cópia e sem "{n}", acrescenta " [C{n}]" para os nomes não ficarem iguais.
 */
export function copySuffix(suffix: string, copies: number, n: number): string {
  const base = copies > 1 && !suffix.includes("{n}") ? `${suffix} [C{n}]` : suffix;
  return base.replaceAll("{n}", String(n));
}

export function campaignHasBudget(c: Obj) {
  return has(c.daily_budget) || has(c.lifetime_budget);
}

export function mapCampaign(c: Obj, opts: { suffix: string; status: CreateStatus; mappings?: Mappings }): MapResult {
  const warnings: string[] = [];
  const payload: Obj = {
    name: `${c.name}${opts.suffix}`,
    objective: c.objective,
    status: opts.status,
    special_ad_categories: (c.special_ad_categories as unknown[] | undefined) ?? [],
    ...pick(c, ["buying_type", "spend_cap", "special_ad_category_country"]),
  };
  if (campaignHasBudget(c)) Object.assign(payload, pick(c, ["daily_budget", "lifetime_budget", "bid_strategy"]));
  else payload.is_adset_budget_sharing_enabled = c.is_adset_budget_sharing_enabled ?? false;
  convertMoney(payload, MONEY_CAMPAIGN, opts.mappings?.currency);
  if (has(c.smart_promotion_type) && c.smart_promotion_type !== "GUIDED_CREATION") {
    warnings.push(`Tipo de campanha “${c.smart_promotion_type}” não é copiado pela API: confira no Gerenciador.`);
  }
  return { payload, warnings };
}

export function sanitizeTargeting(targeting: unknown, warnings: string[]) {
  if (!targeting || typeof targeting !== "object") return targeting;
  const t = structuredClone(targeting) as Record<string, unknown>;
  for (const [field, deprecated] of Object.entries(DEPRECATED_POSITIONS)) {
    const list = t[field];
    if (!Array.isArray(list)) continue;
    for (const d of deprecated) {
      if (list.includes(d.value)) warnings.push(`Posicionamento “${d.label}” removido: a Meta descontinuou.`);
    }
    t[field] = list.filter((p) => !deprecated.some((d) => d.value === p));
  }
  return t;
}

export function mapAdset(
  s: Obj,
  campaign: Obj,
  opts: { newCampaignId: string; status: CreateStatus; mappings?: Mappings },
): MapResult {
  const warnings: string[] = [];
  const payload: Obj = {
    name: s.name,
    campaign_id: opts.newCampaignId,
    status: opts.status,
    targeting: sanitizeTargeting(s.targeting, warnings),
    ...pick(s, [
      "optimization_goal", "billing_event", "bid_amount", "attribution_spec", "frequency_control_specs",
      "dsa_beneficiary", "dsa_payor", "existing_customer_budget_percentage", "daily_min_spend_target",
      "daily_spend_cap", "lifetime_min_spend_target", "lifetime_spend_cap", "bid_constraints",
    ]),
  };
  if (!campaignHasBudget(campaign)) Object.assign(payload, pick(s, ["daily_budget", "lifetime_budget", "bid_strategy"]));
  if (s.is_dynamic_creative) payload.is_dynamic_creative = true;
  if (has(s.destination_type) && s.destination_type !== "UNDEFINED") payload.destination_type = s.destination_type;
  if (has(s.optimization_sub_event) && s.optimization_sub_event !== "NONE") payload.optimization_sub_event = s.optimization_sub_event;
  if (has(s.multi_optimization_goal_weight) && s.multi_optimization_goal_weight !== "UNDEFINED")
    payload.multi_optimization_goal_weight = s.multi_optimization_goal_weight;
  if (s.promoted_object && typeof s.promoted_object === "object") {
    const po = { ...(s.promoted_object as Obj) };
    delete po.smart_pse_enabled; // campo de leitura: a criação não aceita
    po.pixel_id = mapId(opts.mappings?.pixel, po.pixel_id);
    po.custom_conversion_id = mapId(opts.mappings?.custom_conversion, po.custom_conversion_id);
    if (!has(po.pixel_id)) delete po.pixel_id;
    if (!has(po.custom_conversion_id)) delete po.custom_conversion_id;
    payload.promoted_object = po;
  }
  if (payload.targeting && typeof payload.targeting === "object") {
    mapAudiences(payload.targeting as Record<string, unknown>, opts.mappings?.audience, warnings);
  }
  convertMoney(payload, MONEY_ADSET, opts.mappings?.currency);
  // start_time omitido: data no passado é recusada; sem ela, começa quando for ativado.
  if (has(s.end_time) && new Date(String(s.end_time)).getTime() > Date.now()) payload.end_time = s.end_time;
  return { payload, warnings };
}

export function sanitizeDof(dof: unknown, reusingPost: boolean, warnings: string[]) {
  const features = (dof as Obj | undefined)?.creative_features_spec as Obj | undefined;
  if (!features) return dof ?? undefined;
  const kept: Obj = {};
  for (const [name, value] of Object.entries(features)) {
    if (DROPPED_FEATURES[name]) warnings.push(`Melhoria ${DROPPED_FEATURES[name]} removida: a Meta descontinuou.`);
    else if (reusingPost && name.startsWith("pac_")) continue; // só valem com as imagens no criativo
    else kept[name] = value;
  }
  return Object.keys(kept).length ? { ...(dof as Obj), creative_features_spec: kept } : undefined;
}

/** O post que o anúncio usa (caminho A: reaproveitar). */
export function postIdOf(creative: Obj | undefined): string | undefined {
  return (creative?.object_story_id ?? creative?.effective_object_story_id) as string | undefined;
}

/** Caminho A: criativo novo no destino apontando para o MESMO post (mantém a prova social). */
export function mapCreative(ad: Obj, opts: { suffix: string; mappings?: Mappings }): MapResult | { manual: string } {
  const cr = (ad.creative ?? {}) as Obj;
  const postId = postIdOf(cr);
  if (!postId) return { manual: "Anúncio sem post para reaproveitar (precisa recriar o criativo)." };
  const warnings: string[] = [];
  const payload: Obj = {
    name: `${(cr.name as string) ?? (ad.name as string)}${opts.suffix}`,
    object_story_id: postId,
    ...pick(cr, ["contextual_multi_ads", "instagram_user_id", "url_tags"]),
  };
  if (has(payload.instagram_user_id)) payload.instagram_user_id = mapId(opts.mappings?.instagram, payload.instagram_user_id);
  const dof = sanitizeDof(cr.degrees_of_freedom_spec, true, warnings);
  if (dof) payload.degrees_of_freedom_spec = dof;
  const call = (cr.asset_feed_spec as Obj | undefined)?.call_ads_configuration;
  if (call) payload.asset_feed_spec = { call_ads_configuration: call };
  return { payload, warnings };
}

export function mapAd(
  ad: Obj,
  opts: { newAdsetId: string; creativeId: string; status: CreateStatus; mappings?: Mappings },
): MapResult {
  const warnings: string[] = [];
  const specs = (ad.tracking_specs as Obj[] | undefined) ?? [];
  const pixelOnly = specs
    .filter((s) => s["fb_pixel"])
    .map((s) => ({ ...s, fb_pixel: (s["fb_pixel"] as string[]).map((p) => String(mapId(opts.mappings?.pixel, p))) }));
  const payload: Obj = {
    name: ad.name,
    adset_id: opts.newAdsetId,
    creative: { creative_id: opts.creativeId },
    status: opts.status,
    ...pick(ad, ["conversion_domain"]),
  };
  if (pixelOnly.length) payload.tracking_specs = pixelOnly;
  return { payload, warnings };
}

/**
 * Erros de criação de criativo que significam "este anúncio não dá para migrar pela API"
 * (vira "migrar manualmente" no relatório, sem travar o resto). Achado 8 da Fase 0.
 */
export function manualReasonFor(code?: number, subcode?: number): string | undefined {
  if (code === 100 && subcode === 1815017)
    return "Post multi-formato (imagem recortada por posicionamento): a Meta não deixa reaproveitar pela API. Duplique este anúncio no Gerenciador.";
  if (code === 100 && subcode === 1885183)
    return "Recriar este criativo exige o app da Meta em modo público. Duplique este anúncio no Gerenciador.";
  return undefined;
}
