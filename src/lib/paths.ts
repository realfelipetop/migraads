import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Pasta de dados local (banco, mídias, backups, chave de criptografia).
 * Fica fora do Git. Pode ser trocada com a variável MIGRA_DATA_DIR.
 *
 * Os comentários turbopackIgnore evitam que o build tente rastrear a pasta inteira do projeto:
 * esses caminhos só existem em tempo de execução, no computador de quem usa.
 */
export function dataDir(...segments: string[]): string {
  const base = process.env.MIGRA_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  const full = path.join(/*turbopackIgnore: true*/ base, ...segments);
  mkdirSync(full, { recursive: true });
  return full;
}

/** Pasta das migrações SQL geradas pelo drizzle-kit (versionada no Git). */
export function migrationsDir(): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle");
}
