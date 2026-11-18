import { describe, expect, it } from "vitest";
import type { ItemRow, MigrationView } from "@/meta/migrations";
import { migrationCsv } from "./report";

const m = {
  id: "m1",
  status: "done_with_issues",
  sourceAccountId: "act_1",
  destAccountId: "act_2",
  createdAt: "2026-11-12T00:00:00.000Z",
  finishedAt: "2026-11-12T01:00:00.000Z",
  options: { selection: { campaigns: [], adsets: [], ads: [], excluded: [] }, createStatus: "PAUSED", copies: 1 },
} as unknown as MigrationView;

const item = (p: Partial<ItemRow>): ItemRow =>
  ({ id: "i", migrationId: "m1", snapshotId: null, level: "ad", sourceId: "1", copyIndex: 1, name: "AD", status: "done", destId: null, attempts: 1, error: null, warnings: null, updatedAt: "", ...p }) as ItemRow;

describe("relatório CSV", () => {
  const csv = migrationCsv(
    m,
    [
      item({ level: "ad", sourceId: "a3", name: "AD03; memes", status: "manual", error: "Post multi-formato" }),
      item({ level: "campaign", sourceId: "c1", name: "PRODUTO X [MIGRA]", destId: "900" }),
    ],
    { source: "Conta origem", dest: "Conta destino" },
  );
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");

  it("abre no Excel em português: BOM UTF-8 e separador ;", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[8]).toBe("Cópia;Nível;Nome;Situação;ID na origem;ID no destino;Link;Observação");
  });

  it("campanha primeiro, com link para o Gerenciador do destino", () => {
    expect(lines[9]).toContain("Campanha;PRODUTO X [MIGRA];Criado;c1;900;https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=2&selected_campaign_ids=900");
  });

  it("manual leva o link do anúncio ORIGINAL e o motivo; ; no nome vai entre aspas", () => {
    expect(lines[10]).toContain('"AD03; memes";Migrar manualmente;a3;;https://adsmanager.facebook.com/adsmanager/manage/ads?act=1&selected_ad_ids=a3;Post multi-formato');
  });

  it("neutraliza fórmulas de planilha", () => {
    const evil = migrationCsv(m, [item({ name: "=HYPERLINK(1)" })]);
    expect(evil).toContain("'=HYPERLINK(1)");
  });
});
