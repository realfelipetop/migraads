/**
 * Lê a árvore completa de uma campanha (campanha → conjuntos → anúncios → criativos → mídias)
 * e salva um snapshot em JSON. SÓ LEITURA: não cria nem altera nada na Meta.
 *
 * Uso:
 *   npm run read -- --account 111111111111111                 (lista as campanhas da conta)
 *   npm run read -- --account 111111111111111 --name PRODUTO X  (lê as campanhas cujo nome contém "PRODUTO X")
 *   npm run read -- --account 111111111111111 --campaign 120000000000000001
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, DATA_DIR, ensureDir, fail, arg } from "./env.js";
import { Graph, GraphError } from "./graph.js";
import { ACCOUNT_FIELDS, ACCOUNT_STATUS, ADSET_FIELDS, AD_FIELDS, CAMPAIGN_FIELDS } from "./fields.js";

const cfg = loadConfig({ requireToken: true });
const graph = new Graph({ ...cfg, accessToken: cfg.accessToken! });

const accountArg = arg("account");
if (!accountArg) fail("Informe a conta: npm run read -- --account <ID>");
const actId = accountArg.startsWith("act_") ? accountArg : `act_${accountArg}`;
const campaignId = arg("campaign");
const nameFilter = arg("name");

try {
  const account = await graph.get(actId, { fields: ACCOUNT_FIELDS }, "AdAccount");
  const status = ACCOUNT_STATUS[account.account_status] ?? account.account_status;
  console.log(`\n▣ ${account.name} (${account.account_id}) · ${status} · ${account.currency} · ${account.timezone_name}`);
  if (account.account_status !== 1) {
    console.log(`  → RESULTADO FASE 0 · P5: conta com status "${status}" CONTINUA LEGÍVEL pela API.`);
  }

  const campaigns = await graph.getAll<{ id: string; name: string; effective_status: string }>(
    `${actId}/campaigns`,
    { fields: "id,name,effective_status", limit: 200 },
    "Campaign",
  );

  let targets = campaigns;
  if (campaignId) targets = campaigns.filter((c) => c.id === campaignId);
  else if (nameFilter) targets = campaigns.filter((c) => c.name.toLowerCase().includes(nameFilter.toLowerCase()));
  else {
    console.log(`\n${campaigns.length} campanhas:\n`);
    for (const c of campaigns) console.log(`  ${c.effective_status === "ACTIVE" ? "●" : "○"} ${c.id}  ${c.name}`);
    console.log(`\nEscolha uma: npm run read -- --account ${account.account_id} --campaign <ID>  (ou --name <trecho>)\n`);
    process.exit(0);
  }
  if (!targets.length) fail("Nenhuma campanha encontrada com esse filtro.");

  const outDir = ensureDir(join(DATA_DIR, "snapshots", account.account_id));
  for (const c of targets) await snapshotCampaign(account, c.id, outDir);

  printStripped();
  console.log(`\nChamadas à API: ${graph.requestCount}\n`);
} catch (e) {
  fail(e instanceof GraphError ? e.describe() : (e as Error).message);
}

async function snapshotCampaign(account: any, id: string, outDir: string) {
  const campaign = await graph.get(id, { fields: CAMPAIGN_FIELDS }, "Campaign");
  const adsets = await graph.getAll(`${id}/adsets`, { fields: ADSET_FIELDS, limit: 100 }, "AdSet");
  const ads = await graph.getAll(`${id}/ads`, { fields: AD_FIELDS, limit: 50 }, "Ad");

  const { imageHashes, videoIds } = collectMedia(ads);
  const images = await readImages(imageHashes);
  const videos = await readVideos(videoIds);

  const snapshot = {
    meta: { taken_at: new Date().toISOString(), api_version: graph.version, source_account: actId },
    account,
    campaign,
    adsets,
    ads,
    media: { images, videos },
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(outDir, `${id}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(snapshot, null, 2));

  printSummary(campaign, adsets, ads, images, videos);
  console.log(`\n  Snapshot salvo em ${file}`);
}

/** Junta todos os image_hash e video_id usados nos criativos (simples, carrossel e asset_feed_spec). */
function collectMedia(ads: any[]) {
  const imageHashes = new Set<string>();
  const videoIds = new Set<string>();
  for (const ad of ads) {
    const cr = ad.creative ?? {};
    const spec = cr.object_story_spec ?? {};
    const feed = cr.asset_feed_spec ?? {};
    const add = (set: Set<string>, v: unknown) => typeof v === "string" && v && set.add(v);

    add(imageHashes, cr.image_hash);
    add(videoIds, cr.video_id);
    add(imageHashes, spec.link_data?.image_hash);
    add(imageHashes, spec.photo_data?.image_hash);
    add(videoIds, spec.video_data?.video_id);
    add(imageHashes, spec.video_data?.image_hash);
    for (const child of spec.link_data?.child_attachments ?? []) {
      add(imageHashes, child.image_hash);
      add(videoIds, child.video_id);
    }
    for (const img of feed.images ?? []) add(imageHashes, img.hash);
    for (const vid of feed.videos ?? []) {
      add(videoIds, vid.video_id);
      add(imageHashes, vid.thumbnail_hash);
    }
  }
  return { imageHashes: [...imageHashes], videoIds: [...videoIds] };
}

async function readImages(hashes: string[]) {
  if (!hashes.length) return [];
  const out: any[] = [];
  for (let i = 0; i < hashes.length; i += 50) {
    const chunk = hashes.slice(i, i + 50);
    try {
      out.push(
        ...(await graph.getAll(`${actId}/adimages`, { hashes: chunk, fields: "hash,name,url,permalink_url,width,height,status" }, "AdImage")),
      );
    } catch (e) {
      out.push(...chunk.map((hash) => ({ hash, error: e instanceof GraphError ? e.describe() : String(e) })));
    }
  }
  return out;
}

async function readVideos(ids: string[]) {
  const out: any[] = [];
  for (const id of ids) {
    try {
      out.push(await graph.get(id, { fields: "id,title,source,length,picture,format" }, "AdVideo"));
    } catch (e) {
      out.push({ id, error: e instanceof GraphError ? e.describe() : String(e) });
    }
  }
  return out;
}

/** Classifica cada criativo pelo caminho de cópia que o Migra Ads usaria (A, B/C ou especial). */
function classify(cr: any): string {
  if (!cr) return "sem criativo";
  // Achado da Fase 0: anúncios feitos no Gerenciador costumam NÃO trazer object_story_spec.
  // O conteúdo mora no post oculto (effective_object_story_id) — reaproveitável pelo ID (caminho A).
  if (cr.object_story_id) return "A · publicação existente (escolhida no Gerenciador)";
  if (cr.source_instagram_media_id && !cr.effective_object_story_id) return "post do Instagram";
  const feed = cr.asset_feed_spec ?? {};
  const multiMedia = ["images", "videos", "bodies", "titles"].some((k) => Array.isArray(feed[k]) && feed[k].length);
  if (multiMedia) return "asset_feed_spec com várias mídias/textos";
  const spec = cr.object_story_spec;
  if (spec?.video_data) return "vídeo (spec completo)";
  if (spec?.link_data?.child_attachments) return "carrossel (spec completo)";
  if (spec?.link_data || spec?.photo_data) return "imagem (spec completo)";
  if (cr.effective_object_story_id) return "A · post oculto do anúncio (sem spec; reaproveitável pelo ID)";
  return "outro";
}

function printSummary(campaign: any, adsets: any[], ads: any[], images: any[], videos: any[]) {
  const money = (v?: string) => (v ? `${(Number(v) / 100).toFixed(2)}` : "—");
  console.log(`\n■ ${campaign.name}`);
  console.log(
    `  Objetivo ${campaign.objective} · lance ${campaign.bid_strategy ?? "—"} · orçamento campanha ${money(campaign.daily_budget)}/dia` +
      (campaign.smart_promotion_type ? ` · tipo ${campaign.smart_promotion_type}` : ""),
  );
  for (const s of adsets) {
    console.log(
      `  ▦ ${s.name} · otimiza ${s.optimization_goal} · evento ${s.promoted_object?.custom_event_type ?? "—"}` +
        ` · pixel ${s.promoted_object?.pixel_id ?? "—"} · lance ${money(s.bid_amount)} · destino ${s.destination_type ?? "—"}`,
    );
  }

  const byType = new Map<string, number>();
  const flags = { dof: 0, multiAdv: 0, disapproved: 0, tracking: 0 };
  for (const ad of ads) {
    const t = classify(ad.creative);
    byType.set(t, (byType.get(t) ?? 0) + 1);
    if (ad.creative?.degrees_of_freedom_spec) flags.dof++;
    if (ad.creative?.contextual_multi_ads) flags.multiAdv++;
    if (ad.effective_status === "DISAPPROVED") flags.disapproved++;
    if (ad.tracking_specs) flags.tracking++;
  }

  console.log(`  ▢ ${ads.length} anúncios`);
  for (const [t, n] of byType) console.log(`      ${String(n).padStart(3)} × ${t}`);
  console.log(`      Melhorias Advantage+ (degrees_of_freedom_spec): ${flags.dof}`);
  console.log(`      Vários anunciantes (contextual_multi_ads): ${flags.multiAdv}`);
  console.log(`      Com monitorização (tracking_specs): ${flags.tracking}`);
  console.log(`      Reprovados: ${flags.disapproved}`);

  const imgErr = images.filter((i) => i.error || !i.url).length;
  const vidErr = videos.filter((v) => v.error || !v.source).length;
  console.log(`  Mídias: ${images.length} imagens (${images.length - imgErr} com URL) · ${videos.length} vídeos (${videos.length - vidErr} com arquivo baixável)`);
  if (vidErr) console.log("      → Vídeos sem 'source' com token do usuário (com token da página, parte deles libera).");
}

function printStripped() {
  if (!graph.strippedFields.size) return;
  console.log("\nCampos que não existem nesta versão da API (removidos automaticamente):");
  for (const [node, fields] of graph.strippedFields) console.log(`  ${node}: ${[...fields].join(", ")}`);
}
