import type { Graph } from "@/meta/graph";
import { ACCOUNT_STATUS } from "@/meta/fields";
import { formatMoney, fromMinor } from "@/meta/metrics";
import { convertMinor, REMOVE, type Mappings, type Obj } from "./mapper";
import { postIdOf } from "./mapper";
import type { SnapshotData } from "./snapshot";

/**
 * Diagnóstico do destino (PLANO §9). "block" impede a migração; "warn" deixa seguir com aviso.
 * Também levanta os ativos que precisam de mapeamento (pixel, conversão, público, Instagram)
 * e as opções disponíveis no destino para a tela de Mapeamento.
 */
export interface Check {
  id: string;
  label: string;
  level: "ok" | "warn" | "block";
  detail: string;
}

export type AssetKind = "pixel" | "custom_conversion" | "audience" | "instagram" | "page";

export interface AssetNeed {
  kind: AssetKind;
  id: string;
  name?: string;
  usedBy: number;
  /** O destino já enxerga este ativo. */
  available: boolean;
}

export interface Option {
  id: string;
  name: string;
}

export interface Diagnosis {
  checks: Check[];
  needs: AssetNeed[];
  candidates: { pixel: Option[]; custom_conversion: Option[]; audience: Option[]; instagram: Option[] };
  currency: { source: string; dest: string };
  /** Páginas que o usuário NÃO pode usar para anunciar: os anúncios delas viram "migrar manualmente". */
  blockedPages: string[];
}

/** Interface mínima (facilita testes). */
type Reader = Pick<Graph, "get" | "getAll">;

interface Account {
  account_id: string;
  name?: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  disable_reason?: number;
  spend_cap?: string;
  amount_spent?: string;
  funding_source_details?: unknown;
}

/** Ativos usados pelo que foi selecionado. */
export function collectAssets(snaps: SnapshotData[]) {
  const pixels = new Map<string, number>();
  const conversions = new Map<string, number>();
  const audiences = new Map<string, { name?: string; n: number }>();
  const instagram = new Map<string, number>();
  const pages = new Map<string, number>();
  const bump = (m: Map<string, number>, id: unknown) => id && m.set(String(id), (m.get(String(id)) ?? 0) + 1);

  for (const s of snaps) {
    for (const a of s.adsets) {
      const po = (a.promoted_object ?? {}) as Obj;
      bump(pixels, po.pixel_id);
      bump(conversions, po.custom_conversion_id);
      bump(pages, po.page_id);
      const t = (a.targeting ?? {}) as Obj;
      for (const f of ["custom_audiences", "excluded_custom_audiences"]) {
        for (const aud of (t[f] as Obj[] | undefined) ?? []) {
          const cur = audiences.get(String(aud.id));
          audiences.set(String(aud.id), { name: (aud.name as string) ?? cur?.name, n: (cur?.n ?? 0) + 1 });
        }
      }
    }
    for (const ad of s.ads) {
      const cr = (ad.creative ?? {}) as Obj;
      for (const spec of (ad.tracking_specs as Obj[] | undefined) ?? []) for (const p of (spec.fb_pixel as string[] | undefined) ?? []) bump(pixels, p);
      bump(instagram, cr.instagram_user_id);
      const post = postIdOf(cr);
      if (post?.includes("_")) bump(pages, post.split("_")[0]);
    }
  }
  return { pixels, conversions, audiences, instagram, pages };
}

export async function diagnose(
  graph: Reader,
  sourceId: string,
  destId: string,
  snaps: SnapshotData[],
  mappings: Mappings = {},
  sourceFallback?: { currency: string; timezone: string },
  extra: { copies?: number } = {},
): Promise<Diagnosis> {
  const checks: Check[] = [];
  const needs: AssetNeed[] = [];
  const candidates: Diagnosis["candidates"] = { pixel: [], custom_conversion: [], audience: [], instagram: [] };
  const safeList = async (path: string, fields: string) => {
    try {
      return await graph.getAll<{ id: string; name?: string; username?: string }>(path, { fields, limit: 200 });
    } catch {
      return null;
    }
  };

  if (sourceId === destId) {
    return {
      checks: [{ id: "same", label: "Destino diferente da origem", level: "block", detail: "Escolha outra conta de destino." }],
      needs,
      candidates,
      currency: { source: "", dest: "" },
      blockedPages: [],
    };
  }

  const fields = "account_id,name,account_status,currency,timezone_name,disable_reason,spend_cap,amount_spent";
  // A origem pode estar inacessível (é para isso que serve o backup): usa o que o backup guardou.
  const src = await graph.get<Account>(sourceId, { fields }).catch((e) => {
    if (!sourceFallback) throw e;
    return { account_id: sourceId, account_status: 2, currency: sourceFallback.currency, timezone_name: sourceFallback.timezone } as Account;
  });
  const dst = await graph.get<Account>(destId, { fields });

  // 1. Conta ativa
  const active = dst.account_status === 1 || dst.account_status === 201;
  checks.push({
    id: "status",
    label: "Conta de destino ativa",
    level: active ? "ok" : "block",
    detail: active ? "Ativa." : `Status: ${ACCOUNT_STATUS[dst.account_status] ?? dst.account_status}. Escolha uma conta ativa.`,
  });

  // 2. Pagamento
  try {
    const pay = await graph.get<Account>(destId, { fields: "funding_source_details" });
    checks.push({
      id: "funding",
      label: "Forma de pagamento",
      level: pay.funding_source_details ? "ok" : "warn",
      detail: pay.funding_source_details ? "Cadastrada." : "Não encontrada. Os anúncios são criados, mas só rodam depois de você cadastrar uma.",
    });
  } catch {
    checks.push({ id: "funding", label: "Forma de pagamento", level: "warn", detail: "Não deu para conferir. Confira no Gerenciador." });
  }

  // 3. Moeda (dá para converter na tela de mapeamento)
  const sameCurrency = src.currency === dst.currency;
  const rate = mappings.currency?.rate;
  checks.push({
    id: "currency",
    label: "Moeda",
    level: sameCurrency || rate ? "ok" : "block",
    detail: sameCurrency
      ? `${dst.currency}.`
      : rate
        ? `Orçamentos e lances convertidos: 1 ${src.currency} = ${rate} ${dst.currency}.`
        : `Origem em ${src.currency}, destino em ${dst.currency}. Informe a conversão abaixo.`,
  });

  // 4. Fuso
  checks.push({
    id: "timezone",
    label: "Fuso horário",
    level: src.timezone_name === dst.timezone_name ? "ok" : "warn",
    detail:
      src.timezone_name === dst.timezone_name
        ? dst.timezone_name
        : `Origem ${src.timezone_name}, destino ${dst.timezone_name}. Relatórios por dia vão contar em outro fuso.`,
  });

  // 5. Limite de gastos da conta (achado da Fase 6: a conta de teste tinha R$ 0,53 sobrando)
  const cap = Number(dst.spend_cap ?? 0);
  if (cap > 0) {
    const left = Math.max(0, cap - Number(dst.amount_spent ?? 0));
    // Orçamento diário total no destino: soma na moeda da origem, converte e multiplica pelas cópias.
    const dailySource = snaps.reduce((sum, s) => sum + Number(s.campaign.daily_budget ?? 0) + s.adsets.reduce((x, a) => x + Number(a.daily_budget ?? 0), 0), 0);
    const daily = Number(convertMinor(dailySource, mappings.currency)) * Math.max(1, extra.copies ?? 1);
    const leftMoney = formatMoney(fromMinor(left, dst.currency), dst.currency);
    checks.push({
      id: "spend_cap",
      label: "Limite de gastos da conta",
      level: left < Math.max(daily, 1) ? "warn" : "ok",
      detail:
        left < Math.max(daily, 1)
          ? `Restam só ${leftMoney} até o limite da conta: os anúncios vão parar logo depois de ativados. Aumente o limite em Configurações de pagamento.`
          : `Restam ${leftMoney} até o limite.`,
    });
  }

  const used = collectAssets(snaps);

  // 6. Pixels
  const pixelList = await safeList(`${destId}/adspixels`, "id,name");
  candidates.pixel = (pixelList ?? []).map((p) => ({ id: p.id, name: p.name ?? p.id }));
  for (const [id, n] of used.pixels) {
    const available = !pixelList || pixelList.some((p) => p.id === id);
    // Nome do pixel da origem (ex.: "MINHALOJA"), para a tela de mapeamento não mostrar só o número.
    const name = await graph.get<{ name?: string }>(id, { fields: "name" }).then((p) => p.name).catch(() => undefined);
    needs.push({ kind: "pixel", id, name: name ? `${name} (${id})` : id, usedBy: n, available });
  }
  if (used.pixels.size) {
    const missing = [...used.pixels.keys()].filter((id) => !needs.find((x) => x.kind === "pixel" && x.id === id)?.available && !mappings.pixel?.[id]);
    checks.push({
      id: "pixel",
      label: "Pixel",
      level: !pixelList ? "warn" : missing.length ? "block" : "ok",
      detail: !pixelList
        ? "Não deu para listar os pixels do destino."
        : missing.length
          ? `O destino não enxerga o pixel ${missing.join(", ")}. Compartilhe na BM ou escolha outro pixel abaixo.`
          : `Pixel ${[...used.pixels.keys()].map((id) => mappings.pixel?.[id] ?? id).join(", ")} disponível.`,
    });
  }

  // 7. Conversões personalizadas
  if (used.conversions.size) {
    const list = await safeList(`${destId}/customconversions`, "id,name");
    candidates.custom_conversion = (list ?? []).map((c) => ({ id: c.id, name: c.name ?? c.id }));
    const missing: string[] = [];
    for (const [id, n] of used.conversions) {
      const available = !!list?.some((c) => c.id === id);
      needs.push({ kind: "custom_conversion", id, usedBy: n, available });
      if (!available && !mappings.custom_conversion?.[id]) missing.push(id);
    }
    checks.push({
      id: "custom_conversion",
      label: "Conversões personalizadas",
      level: missing.length ? "block" : "ok",
      detail: missing.length ? `${missing.length} conversão(ões) não existem no destino. Escolha outra abaixo.` : "Disponíveis.",
    });
  }

  // 8. Públicos personalizados
  if (used.audiences.size) {
    const list = await safeList(`${destId}/customaudiences`, "id,name");
    candidates.audience = (list ?? []).map((a) => ({ id: a.id, name: a.name ?? a.id }));
    const missing: string[] = [];
    for (const [id, info] of used.audiences) {
      const available = !!list?.some((a) => a.id === id);
      needs.push({ kind: "audience", id, name: info.name, usedBy: info.n, available });
      if (!available && !mappings.audience?.[id]) missing.push(info.name ?? id);
    }
    checks.push({
      id: "audience",
      label: "Públicos personalizados",
      level: missing.length ? "block" : "ok",
      detail: missing.length
        ? `${missing.length} público(s) não existem no destino (${missing.slice(0, 3).join(", ")}). Troque ou remova abaixo.`
        : "Disponíveis (ou trocados).",
    });
  }

  // 9. Página: o que importa é a SUA permissão de anunciar pela página (achado da Fase 0/2).
  const blockedPages: string[] = [];
  if (used.pages.size) {
    const myPages = await safeList("me/accounts", "id,name,tasks");
    for (const [id, n] of used.pages) {
      const page = myPages?.find((p) => p.id === id) as { tasks?: string[]; name?: string } | undefined;
      const can = !myPages || !!page?.tasks?.includes("ADVERTISE");
      needs.push({ kind: "page", id, name: page?.name, usedBy: n, available: can });
      if (!can) blockedPages.push(id);
    }
    checks.push({
      id: "page",
      label: "Página",
      level: blockedPages.length ? "warn" : "ok",
      detail: blockedPages.length
        ? `Você não tem permissão de anunciar pela página ${blockedPages.join(", ")}: os anúncios dela vão para “migrar manualmente”. Peça acesso de anunciante à página.`
        : `Você pode anunciar pela(s) página(s) ${[...used.pages.keys()].map((id) => needs.find((x) => x.id === id)?.name ?? id).join(", ")}.`,
    });
  }

  // 10. Instagram: só informativo; dá para trocar a conta abaixo.
  if (used.instagram.size) {
    const list = await safeList(`${destId}/instagram_accounts`, "id,username");
    candidates.instagram = (list ?? []).map((a) => ({ id: a.id, name: a.username ? `@${a.username}` : a.id }));
    for (const [id, n] of used.instagram) needs.push({ kind: "instagram", id, usedBy: n, available: true });
  }

  return { checks, needs, candidates, currency: { source: src.currency, dest: dst.currency }, blockedPages };
}

/** Restrição da conta de origem (PLANO §10.5). */
export function restrictionNotice(status: number): string | null {
  if (status === 1 || status === 201) return null;
  return "Se a restrição foi por falha ou análise automática, migrar é seguro. Se foi por violação de política, corrija o anúncio antes de migrar: a Meta liga as contas pelo conteúdo, pela página e pelo domínio.";
}

export { REMOVE };
