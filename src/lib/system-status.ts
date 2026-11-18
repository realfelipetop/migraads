import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { dataDir } from "@/lib/paths";
import { META_API_VERSION } from "@/config/brand";
import pkg from "../../package.json";

export interface SystemStatus {
  version: string;
  apiVersion: string;
  db: { ok: true; tables: number } | { ok: false; error: string };
  dataDir: string;
  node: string;
  platform: string;
}

/** Lê o estado do app. Sempre em tempo de requisição (nunca no build). */
export async function getSystemStatus(): Promise<SystemStatus> {
  await connection();
  let db: SystemStatus["db"];
  try {
    const row = getDb().get<{ n: number }>(
      sql`select count(*) as n from sqlite_master
          where type = 'table' and substr(name, 1, 7) != 'sqlite_' and substr(name, 1, 2) != '__'`,
    );
    db = { ok: true, tables: row.n };
  } catch (e) {
    db = { ok: false, error: (e as Error).message };
  }
  return {
    version: pkg.version,
    apiVersion: META_API_VERSION,
    db,
    dataDir: dataDir(),
    node: process.version,
    platform: process.platform,
  };
}
