import { adsManagerUrl, MIGRATION_STATUS, type ItemRow, type MigrationView } from "@/meta/migrations";

const LEVEL: Record<string, string> = { campaign: "Campanha", adset: "Conjunto", ad: "Anúncio", creative: "Criativo", media: "Mídia" };
const ITEM_STATUS: Record<string, string> = {
  done: "Criado",
  manual: "Migrar manualmente",
  failed: "Erro",
  pending: "Pendente",
  skipped: "Pulado",
};

/** Campo CSV: aspas quando precisa; neutraliza fórmulas (=, +, -, @) para planilhas. */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Relatório da migração em CSV no padrão brasileiro (separador ";" e BOM UTF-8),
 * que abre direto no Excel e no Google Planilhas.
 */
export function migrationCsv(m: MigrationView, items: ItemRow[], names: { source?: string; dest?: string } = {}): string {
  const order: Record<string, number> = { campaign: 0, adset: 1, ad: 2 };
  const sorted = [...items].sort((a, b) => a.copyIndex - b.copyIndex || (order[a.level] ?? 3) - (order[b.level] ?? 3));
  const link = (i: ItemRow) => {
    if (!i.destId || !m.destAccountId) return i.status === "manual" ? adsManagerUrl.ad(m.sourceAccountId, i.sourceId) : "";
    return i.level === "campaign" ? adsManagerUrl.campaign(m.destAccountId, i.destId) : i.level === "ad" ? adsManagerUrl.ad(m.destAccountId, i.destId) : "";
  };

  const header = [
    ["Migra Ads — relatório da migração"],
    ["Origem", names.source ?? m.sourceAccountId, m.sourceAccountId],
    ["Destino", names.dest ?? m.destAccountId ?? "", m.destAccountId ?? ""],
    ["Situação", MIGRATION_STATUS[m.status]],
    ["Criado como", m.options.createStatus === "ACTIVE" ? "Ativo" : "Pausado"],
    ["Cópias", m.options.copies ?? 1],
    ["Terminou em", m.finishedAt ? new Date(m.finishedAt).toLocaleString("pt-BR") : ""],
    [],
    ["Cópia", "Nível", "Nome", "Situação", "ID na origem", "ID no destino", "Link", "Observação"],
  ];
  const rows = sorted.map((i) => [
    i.copyIndex,
    LEVEL[i.level] ?? i.level,
    i.name,
    ITEM_STATUS[i.status] ?? i.status,
    i.sourceId,
    i.destId ?? "",
    link(i),
    i.error ?? (i.warnings?.length ? i.warnings.join(" | ") : ""),
  ]);
  return "﻿" + [...header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
