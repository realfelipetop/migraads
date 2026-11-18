import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDb } from "./index";
import { idMap, migrationItems, migrations, settings } from "./schema";

const dir = mkdtempSync(path.join(tmpdir(), "migra-ads-test-"));
const db = openDb(path.join(dir, "test.db"));

afterAll(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("banco local", () => {
  it("cria todas as tabelas do plano", () => {
    const tables = db.$client
      .prepare("select name from sqlite_master where type = 'table' and name not like '\\_\\_%' escape '\\' and name not like 'sqlite_%'")
      .all()
      .map((r) => (r as { name: string }).name)
      .sort();
    expect(tables).toEqual(
      [
        "accounts_cache", "asset_mappings", "backup_jobs", "backups", "connections", "id_map",
        "logs", "media", "media_copies", "migration_items", "migrations", "settings", "snapshots",
      ].sort(),
    );
  });

  it("guarda e lê configurações em JSON", () => {
    db.insert(settings).values({ key: "theme", value: { mode: "system" } }).run();
    const row = db.select().from(settings).where(eq(settings.key, "theme")).get();
    expect(row?.value).toEqual({ mode: "system" });
  });

  it("não deixa o mesmo item de migração ser criado duas vezes (base da retomada)", () => {
    const m = db.insert(migrations).values({ sourceAccountId: "act_1" }).returning().get();
    const item = { migrationId: m.id, level: "ad" as const, sourceId: "123", copyIndex: 1 };
    db.insert(migrationItems).values(item).run();
    expect(() => db.insert(migrationItems).values(item).run()).toThrow(/UNIQUE/);
  });

  it("id_map: uma linha por origem dentro da mesma migração; outra migração pode criar outra cópia", () => {
    const row = { migrationId: "m1", destAccountId: "act_2", level: "campaign", sourceId: "c1", destId: "n1" };
    db.insert(idMap).values(row).run();
    expect(() => db.insert(idMap).values({ ...row, destId: "n2" }).run()).toThrow(/UNIQUE|PRIMARY/);
    expect(() => db.insert(idMap).values({ ...row, migrationId: "m2", destId: "n3" }).run()).not.toThrow();
  });
});
