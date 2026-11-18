/**
 * Fase 0 · Teste de escrita: recria uma campanha (a partir de um snapshot) em outra conta.
 *
 * - SEM --execute: só simula. Monta todos os payloads e salva em data/plans/, sem chamar a Meta para escrever.
 * - COM --execute: cria tudo PAUSADO, na ordem campanha → conjuntos → criativos → anúncios.
 * - Guarda um mapa origem → destino em data/runs/. Se rodar de novo, pula o que já foi criado (não duplica).
 *
 * Estratégia de criativo (caminho A): reaproveita o post do anúncio (object_story_id ou
 * effective_object_story_id). Não baixa nem sobe mídia.
 *
 * Uso:
 *   npm run recreate -- --snapshot <arquivo.json> --dest 2222222222222222
 *   npm run recreate -- --snapshot <arquivo.json> --dest 2222222222222222 --execute
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadConfig, DATA_DIR, ensureDir, fail, arg } from "./env.js";
import { Graph, GraphError } from "./graph.js";

const cfg = loadConfig({ requireToken: true });
const graph = new Graph({ ...cfg, accessToken: cfg.accessToken! });

const snapshotPath = arg("snapshot");
const destArg = arg("dest");
const execute = process.argv.includes("--execute");
const suffix = arg("suffix") ?? " [MIGRA TESTE]";
if (!snapshotPath || !destArg) fail("Uso: npm run recreate -- --snapshot <arquivo.json> --dest <ID da conta> [--execute]");
if (!existsSync(snapshotPath)) fail(`Snapshot não encontrado: ${snapshotPath}`);

const dest = destArg.startsWith("act_") ? destArg : `act_${destArg}`;
const snap = JSON.parse(readFileSync(snapshotPath, "utf8"));
const { campaign, adsets, ads } = snap as { campaign: any; adsets: any[]; ads: any[] };

// ───────────────────────── Mapeamento origem → destino ─────────────────────────

const has = (v: unknown) => v !== undefined && v !== null && v !== "";
const pick = (obj: any, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => has(obj?.[k])).map((k) => [k, obj[k]]));

const campaignHasBudget = has(campaign.daily_budget) || has(campaign.lifetime_budget);

function campaignPayload() {
  const p: Record<string, unknown> = {
    name: `${campaign.name}${suffix}`,
    objective: campaign.objective,
    status: "PAUSED",
    special_ad_categories: campaign.special_ad_categories ?? [],
    ...pick(campaign, ["buying_type", "spend_cap", "special_ad_category_country"]),
  };
  if (campaignHasBudget) {
    Object.assign(p, pick(campaign, ["daily_budget", "lifetime_budget", "bid_strategy"]));
  } else {
    p.is_adset_budget_sharing_enabled = campaign.is_adset_budget_sharing_enabled ?? false;
  }
  return p;
}

/**
 * Posicionamentos que a Meta descontinuou para criação. Conjuntos antigos ainda os têm salvos,
 * mas a criação de um conjunto novo com eles é recusada (achado da Fase 0, v26.0).
 */
const DEPRECATED_POSITIONS: Record<string, string[]> = {
  instagram_positions: ["explore"],
};

export const removedPlacements: string[] = [];

function sanitizeTargeting(targeting: any) {
  if (!targeting) return targeting;
  const t = structuredClone(targeting);
  for (const [field, deprecated] of Object.entries(DEPRECATED_POSITIONS)) {
    if (!Array.isArray(t[field])) continue;
    const removed = t[field].filter((pos: string) => deprecated.includes(pos));
    if (removed.length) {
      t[field] = t[field].filter((pos: string) => !deprecated.includes(pos));
      for (const r of removed) if (!removedPlacements.includes(`${field}.${r}`)) removedPlacements.push(`${field}.${r}`);
    }
  }
  return t;
}

function adsetPayload(s: any, newCampaignId: string) {
  const p: Record<string, unknown> = {
    name: s.name,
    campaign_id: newCampaignId,
    status: "PAUSED",
    targeting: sanitizeTargeting(s.targeting),
    ...pick(s, [
      "optimization_goal", "billing_event", "bid_amount", "attribution_spec",
      "frequency_control_specs", "dsa_beneficiary", "dsa_payor", "existing_customer_budget_percentage",
      "daily_min_spend_target", "daily_spend_cap", "lifetime_min_spend_target", "lifetime_spend_cap",
    ]),
  };
  if (!campaignHasBudget) Object.assign(p, pick(s, ["daily_budget", "lifetime_budget", "bid_strategy"]));
  if (s.is_dynamic_creative) p.is_dynamic_creative = true;
  if (s.destination_type && s.destination_type !== "UNDEFINED") p.destination_type = s.destination_type;
  if (s.optimization_sub_event && s.optimization_sub_event !== "NONE") p.optimization_sub_event = s.optimization_sub_event;
  if (s.multi_optimization_goal_weight && s.multi_optimization_goal_weight !== "UNDEFINED")
    p.multi_optimization_goal_weight = s.multi_optimization_goal_weight;
  if (s.promoted_object) {
    const { smart_pse_enabled: _ignored, ...po } = s.promoted_object;
    p.promoted_object = po;
  }
  if (s.end_time && new Date(s.end_time).getTime() > Date.now()) p.end_time = s.end_time;
  // start_time omitido de propósito: data no passado é recusada; sem ela, começa quando for ativado.
  return p;
}

/**
 * Melhorias Advantage+ (degrees_of_freedom_spec), ajustadas às regras atuais (achados da Fase 0, v26.0):
 * - standard_enhancements (pacote) foi descontinuado: só valem as melhorias individuais.
 * - pac_* (proporções por posicionamento) exigem as imagens no asset_feed_spec; reaproveitando o post,
 *   a Meta trata o criativo como "dinâmico de catálogo" e recusa.
 */
const DROPPED_FEATURES = ["standard_enhancements"];
export const droppedFeatures = new Map<string, number>();

function sanitizeDof(dof: any, reusingPost: boolean) {
  const features = dof?.creative_features_spec;
  if (!features) return dof;
  const kept: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(features)) {
    const drop = DROPPED_FEATURES.includes(name) || (reusingPost && name.startsWith("pac_"));
    if (drop) droppedFeatures.set(name, (droppedFeatures.get(name) ?? 0) + 1);
    else kept[name] = value;
  }
  if (!Object.keys(kept).length) return undefined;
  return { ...dof, creative_features_spec: kept };
}

/** Caminho A: novo criativo no destino apontando para o mesmo post. */
function creativePayload(ad: any) {
  const cr = ad.creative ?? {};
  const postId = cr.object_story_id ?? cr.effective_object_story_id;
  if (!postId) return { error: "Anúncio sem ID de post: precisaria do caminho B/C (fora deste teste)." };
  const p: Record<string, unknown> = {
    name: cr.name ? `${cr.name}${suffix}` : `${ad.name}${suffix}`,
    object_story_id: postId,
    ...pick(cr, ["contextual_multi_ads", "instagram_user_id", "url_tags"]),
  };
  const dof = sanitizeDof(cr.degrees_of_freedom_spec, true);
  if (dof) p.degrees_of_freedom_spec = dof;
  const callConfig = cr.asset_feed_spec?.call_ads_configuration;
  if (callConfig) p.asset_feed_spec = { call_ads_configuration: callConfig };
  const droppedFeed = cr.asset_feed_spec && Object.keys(cr.asset_feed_spec).some((k) => k !== "call_ads_configuration");
  return { payload: p, postId, droppedFeed };
}

/** Remove os "id" dos rótulos (adlabels, *_label): eles pertencem à conta de origem. O "name" liga as regras. */
function stripLabelIds(value: any): any {
  if (Array.isArray(value)) return value.map(stripLabelIds);
  if (!value || typeof value !== "object") return value;
  const out: any = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "adlabels" && Array.isArray(v)) out[k] = v.map((l: any) => ({ name: l.name }));
    else if (k.endsWith("_label") && v && typeof v === "object") out[k] = { name: (v as any).name };
    else out[k] = stripLabelIds(v);
  }
  return out;
}

const copiedImages: Record<string, string> = {};

/** Caminho B: copia as imagens para o destino (copy_from) e remonta o criativo com asset_feed_spec. */
async function pathBPayload(ad: any): Promise<{ payload?: Record<string, unknown>; error?: string }> {
  const cr = ad.creative;
  const feed = stripLabelIds(structuredClone(cr.asset_feed_spec));
  if (feed.videos?.length) return { error: "caminho B com vídeo ainda não testado" };
  const srcAccountId = String(snap.account.account_id);
  for (const img of feed.images ?? []) {
    if (!copiedImages[img.hash]) {
      const res = await graph.post(`${dest}/adimages`, { copy_from: { source_account_id: srcAccountId, hash: img.hash } });
      const first: any = Object.values(res.images ?? {})[0];
      if (!first?.hash) return { error: `cópia da imagem ${img.hash} não devolveu hash` };
      copiedImages[img.hash] = first.hash;
    }
    img.hash = copiedImages[img.hash];
  }
  for (const rule of feed.asset_customization_rules ?? []) rule.customization_spec = sanitizeTargeting(rule.customization_spec);
  const p: Record<string, unknown> = {
    name: `${cr.name ?? ad.name}${suffix}`,
    object_story_spec: cr.object_story_spec,
    asset_feed_spec: feed,
    ...pick(cr, ["contextual_multi_ads", "url_tags", "branded_content", "facebook_branded_content", "instagram_branded_content"]),
  };
  const dof = sanitizeDof(cr.degrees_of_freedom_spec, false);
  if (dof) p.degrees_of_freedom_spec = dof;
  return { payload: p };
}

/** tracking_specs: mantém só o pixel. Conversões personalizadas pertencem à conta de origem. */
function trackingSpecs(ad: any) {
  const specs: any[] = ad.tracking_specs ?? [];
  const kept = specs.filter((s) => s["fb_pixel"]);
  return kept.length ? kept : undefined;
}

function adPayload(ad: any, newAdsetId: string, creativeId: string) {
  return {
    name: ad.name,
    adset_id: newAdsetId,
    creative: { creative_id: creativeId },
    status: "PAUSED",
    ...(trackingSpecs(ad) ? { tracking_specs: trackingSpecs(ad) } : {}),
    ...pick(ad, ["conversion_domain"]),
  };
}

// ───────────────────────── Estado (retomada sem duplicar) ─────────────────────────

const runsDir = ensureDir(join(DATA_DIR, "runs"));
const runFile = join(runsDir, `${campaign.id}-to-${dest.replace("act_", "")}.json`);
type RunState = { map: Record<string, string>; errors: Record<string, string>; notes: string[] };
const state: RunState = existsSync(runFile)
  ? JSON.parse(readFileSync(runFile, "utf8"))
  : { map: {}, errors: {}, notes: [] };
const save = () => writeFileSync(runFile, JSON.stringify(state, null, 2));

async function create(key: string, edge: string, payload: Record<string, unknown>): Promise<string | undefined> {
  if (state.map[key]) return state.map[key];
  try {
    const res = await graph.post<{ id: string }>(`${dest}/${edge}`, payload);
    state.map[key] = res.id;
    delete state.errors[key];
    save();
    return res.id;
  } catch (e) {
    state.errors[key] = e instanceof GraphError ? e.describe() : String(e);
    save();
    return undefined;
  }
}

// ───────────────────────── Plano ─────────────────────────

const destAccount = await graph.get(dest, { fields: "name,account_id,currency,timezone_name,account_status" });
const src = snap.account;
console.log(`\nOrigem:  ${src.name} (${src.account_id}) · ${src.currency} · ${src.timezone_name}`);
console.log(`Destino: ${destAccount.name} (${destAccount.account_id}) · ${destAccount.currency} · ${destAccount.timezone_name}`);
if (destAccount.currency !== src.currency) fail("Moeda diferente entre origem e destino — fora do escopo deste teste.");

const creatives = ads.map((ad) => ({ ad, ...creativePayload(ad) }));
const plan = {
  campaign: campaignPayload(),
  adsets: adsets.map((s) => adsetPayload(s, "<nova campanha>")),
  creatives: creatives.map((c) => ({ ad: c.ad.name, ...("payload" in c ? { payload: c.payload } : { error: c.error }) })),
  ads: ads.map((ad) => adPayload(ad, "<novo conjunto>", "<novo criativo>")),
};
const plansDir = ensureDir(join(DATA_DIR, "plans"));
const planFile = join(plansDir, `${basename(snapshotPath, ".json")}-to-${destAccount.account_id}.json`);
writeFileSync(planFile, JSON.stringify(plan, null, 2));

const droppedFeed = creatives.filter((c) => "droppedFeed" in c && c.droppedFeed).length;
const droppedTracking = ads.filter((ad) => (ad.tracking_specs ?? []).length > (trackingSpecs(ad)?.length ?? 0)).length;
const noPost = creatives.filter((c) => "error" in c).length;

console.log(`\nPlano (${execute ? "EXECUTAR" : "SIMULAÇÃO"}) — tudo PAUSADO:`);
console.log(`  ■ 1 campanha   "${plan.campaign.name}"`);
console.log(`  ▦ ${adsets.length} conjunto(s)`);
console.log(`  ▢ ${ads.length} anúncios · ${ads.length - noPost} reaproveitando o post${noPost ? ` · ${noPost} sem post (pulados)` : ""}`);
console.log(`  Avisos:`);
console.log(`    • smart_promotion_type "${campaign.smart_promotion_type ?? "—"}" não é enviado (marcador do fluxo do Gerenciador).`);
if (droppedFeatures.size)
  console.log(`    • Melhorias removidas: ${[...droppedFeatures].map(([f, n]) => `${f} (${n})`).join(", ")}.`);
if (removedPlacements.length) console.log(`    • Posicionamentos descontinuados removidos: ${removedPlacements.join(", ")}.`);
if (droppedFeed) console.log(`    • ${droppedFeed} anúncio(s) tinham asset_feed_spec com várias mídias: o post é reaproveitado, as personalizações extras não.`);
if (droppedTracking) console.log(`    • ${droppedTracking} anúncio(s): monitorização reduzida ao pixel (conversões personalizadas são da conta de origem).`);
console.log(`  Payloads completos: ${planFile}`);

if (!execute) {
  console.log(`\nNada foi criado. Para executar, rode de novo com --execute\n`);
  process.exit(0);
}

// ───────────────────────── Execução ─────────────────────────

console.log("\nCriando…");
const campaignId = await create(`campaign:${campaign.id}`, "campaigns", plan.campaign);
if (!campaignId) fail(`Campanha não foi criada: ${state.errors[`campaign:${campaign.id}`]}`);
console.log(`  ✔ campanha ${campaignId}`);

const adsetIds: Record<string, string> = {};
for (const s of adsets) {
  const id = await create(`adset:${s.id}`, "adsets", adsetPayload(s, campaignId));
  if (id) {
    adsetIds[s.id] = id;
    console.log(`  ✔ conjunto ${s.name} → ${id}`);
  } else console.log(`  ✖ conjunto ${s.name}: ${state.errors[`adset:${s.id}`]}`);
}

const creativeByPost: Record<string, string> = {};
let okAds = 0;
for (const c of creatives) {
  const ad = c.ad;
  const adsetId = adsetIds[ad.adset_id];
  if (!adsetId) {
    console.log(`  – ${ad.name}: conjunto não foi criado, pulando`);
    continue;
  }
  if (!("payload" in c) || !c.payload) {
    console.log(`  – ${ad.name}: ${c.error}`);
    continue;
  }
  let creativeId: string | undefined =
    creativeByPost[c.postId!] ?? (await create(`creative:${ad.creative.id}`, "adcreatives", c.payload));
  const pathAError = state.errors[`creative:${ad.creative.id}`] ?? "";
  if (!creativeId && /1815017/.test(pathAError) && ad.creative.asset_feed_spec?.images?.length) {
    console.log(`  ↻ ${ad.name}: post multi-formato — tentando caminho B (copiar imagens + remontar)…`);
    try {
      const b = await pathBPayload(ad);
      if (b.payload) creativeId = await create(`creative-b:${ad.creative.id}`, "adcreatives", b.payload);
      else state.errors[`creative-b:${ad.creative.id}`] = b.error!;
    } catch (e) {
      state.errors[`creative-b:${ad.creative.id}`] = e instanceof GraphError ? e.describe() : String(e);
    }
    if (creativeId) {
      delete state.errors[`creative:${ad.creative.id}`];
      save();
    } else {
      console.log(`  ✖ caminho B de ${ad.name}: ${state.errors[`creative-b:${ad.creative.id}`]}`);
      save();
      continue;
    }
  }
  if (!creativeId) {
    console.log(`  ✖ criativo de ${ad.name}: ${state.errors[`creative:${ad.creative.id}`]}`);
    continue;
  }
  creativeByPost[c.postId!] = creativeId;
  const adId = await create(`ad:${ad.id}`, "ads", adPayload(ad, adsetId, creativeId));
  if (adId) {
    okAds++;
    console.log(`  ✔ ${ad.name} → ${adId}`);
  } else console.log(`  ✖ ${ad.name}: ${state.errors[`ad:${ad.id}`]}`);
}

console.log(`\nResultado: ${okAds}/${ads.length} anúncios criados · ${Object.keys(state.errors).length} erro(s).`);
console.log(`Mapa origem → destino e erros: ${runFile}`);
console.log(`Gerenciador: https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${destAccount.account_id}&selected_campaign_ids=${campaignId}\n`);
