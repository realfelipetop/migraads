import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/paths";

/**
 * Criptografia local (AES-256-GCM) para o token da Meta e a chave secreta do app.
 *
 * A chave fica em data/secret.key, gerada na primeira vez. Isso protege contra vazamento acidental
 * (print do banco, backup compartilhado, commit por engano). NÃO protege contra um vírus no
 * computador, que poderia ler a chave e o banco juntos — o README diz isso.
 */

const VERSION = "v1";
let cachedKey: Buffer | undefined;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const file = path.join(dataDir(), "secret.key");
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600 });
  const k = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
  if (k.length !== 32) throw new Error("data/secret.key está corrompida (esperado 32 bytes).");
  cachedKey = k;
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Formato criptografado desconhecido.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** Só para testes: esquece a chave em memória. */
export function _resetKeyCache() {
  cachedKey = undefined;
}
