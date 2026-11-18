import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { dataDir, migrationsDir } from "@/lib/paths";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/**
 * Abre (ou cria) o banco local e aplica as migrações pendentes.
 * Guardado em globalThis para sobreviver ao hot reload do `next dev`.
 *
 * IMPORTANTE (Next 16 + Cache Components): o better-sqlite3 é síncrono, então uma consulta feita
 * durante o build seria "congelada" na página. Em componentes e rotas, chame `await connection()`
 * (de "next/server") ANTES de usar o banco.
 */
export function getDb(): Db {
  const g = globalThis as unknown as { __migraDb?: Db };
  if (!g.__migraDb) g.__migraDb = openDb(path.join(dataDir(), "migra-ads.db"));
  return g.__migraDb;
}

export function openDb(file: string): Db {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema }) as Db;
  migrate(db, { migrationsFolder: migrationsDir() });
  return db;
}

export { schema };
