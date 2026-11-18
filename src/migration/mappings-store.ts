import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Mappings } from "./mapper";

/**
 * Mapeamentos salvos por conta de destino (PLANO §13, tabela asset_mappings).
 * Na próxima migração para a mesma conta, já vêm preenchidos.
 */
type Kind = "pixel" | "custom_conversion" | "audience" | "instagram";
const KINDS: Kind[] = ["pixel", "custom_conversion", "audience", "instagram"];

export function loadSavedMappings(destAccountId: string): Mappings {
  const rows = getDb().select().from(schema.assetMappings).where(eq(schema.assetMappings.destAccountId, destAccountId)).all();
  const out: Mappings = {};
  for (const r of rows) {
    if (!KINDS.includes(r.kind as Kind)) continue;
    const table = (out[r.kind as Kind] ??= {});
    table[r.sourceId] = r.destId;
  }
  return out;
}

export function saveMappings(destAccountId: string, m: Mappings) {
  const db = getDb();
  db.transaction((tx) => {
    for (const kind of KINDS) {
      for (const [sourceId, destId] of Object.entries(m[kind] ?? {})) {
        // "Remover do conjunto" vale só para esta migração: guardar faria a próxima tirar o público sem perguntar.
        if (!destId || destId === "__remove__") continue;
        tx.insert(schema.assetMappings)
          .values({ destAccountId, kind, sourceId, destId })
          .onConflictDoUpdate({
            target: [schema.assetMappings.destAccountId, schema.assetMappings.kind, schema.assetMappings.sourceId],
            set: { destId },
          })
          .run();
      }
    }
  });
}

/** Junta mapeamentos (os da direita têm prioridade). */
export function mergeMappings(...list: (Mappings | undefined)[]): Mappings {
  const out: Mappings = {};
  for (const m of list) {
    if (!m) continue;
    for (const kind of KINDS) if (m[kind]) out[kind] = { ...out[kind], ...m[kind] };
    if (m.currency) out.currency = m.currency;
  }
  return out;
}

/** Limpa o que veio do navegador: só IDs numéricos (ou "remover"), e taxa de câmbio válida. */
export function sanitizeMappings(input: unknown, currency?: { from: string; to: string }): Mappings {
  const raw = (input ?? {}) as Record<string, unknown>;
  const out: Mappings = {};
  for (const kind of KINDS) {
    const table = raw[kind] as Record<string, unknown> | undefined;
    if (!table || typeof table !== "object") continue;
    for (const [k, v] of Object.entries(table)) {
      if (!/^\d+$/.test(k) || typeof v !== "string" || !(v === "__remove__" || /^\d+$/.test(v))) continue;
      if (v === "__remove__" && kind !== "audience") continue;
      (out[kind] ??= {})[k] = v;
    }
  }
  const rate = Number((raw.currency as { rate?: unknown } | undefined)?.rate);
  if (currency && currency.from !== currency.to && Number.isFinite(rate) && rate > 0 && rate < 1_000_000) {
    out.currency = { from: currency.from, to: currency.to, rate };
  }
  return out;
}
