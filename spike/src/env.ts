import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SPIKE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ENV_PATH = join(SPIKE_DIR, ".env.local");
export const DATA_DIR = join(SPIKE_DIR, "data");

export const REDIRECT_PORT = 3000;
export const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/api/auth/callback`;

/** Lê o .env.local (formato CHAVE=valor). Não usa dependências externas. */
export function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** Atualiza (ou acrescenta) chaves no .env.local, preservando o resto do arquivo. */
export function saveEnv(updates: Record<string, string>): void {
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8").split(/\r?\n/) : [];
  const pending = new Map(Object.entries(updates));
  const next = lines.map((line) => {
    const key = line.split("=")[0]?.trim();
    if (key && pending.has(key)) {
      const value = pending.get(key)!;
      pending.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });
  for (const [key, value] of pending) next.push(`${key}=${value}`);
  writeFileSync(ENV_PATH, next.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
}

export interface Config {
  appId: string;
  appSecret: string;
  apiVersion: string;
  loginConfigId?: string;
  accessToken?: string;
  tokenExpiresAt?: string;
}

export function loadConfig(opts: { requireToken?: boolean } = {}): Config {
  const env = readEnvFile();
  const cfg: Config = {
    appId: env.META_APP_ID ?? "",
    appSecret: env.META_APP_SECRET ?? "",
    apiVersion: env.META_API_VERSION || "v26.0",
    loginConfigId: env.META_LOGIN_CONFIG_ID || undefined,
    accessToken: env.META_ACCESS_TOKEN || undefined,
    tokenExpiresAt: env.META_TOKEN_EXPIRES_AT || undefined,
  };

  const missing: string[] = [];
  if (!cfg.appId) missing.push("META_APP_ID");
  if (!cfg.appSecret) missing.push("META_APP_SECRET");
  if (opts.requireToken && !cfg.accessToken) missing.push("META_ACCESS_TOKEN");
  if (missing.length) {
    fail(
      `Faltando no spike/.env.local: ${missing.join(", ")}.\n` +
        (missing.length === 1 && missing[0] === "META_ACCESS_TOKEN"
          ? "Rode `npm run login` (ou `npm run token`) primeiro."
          : "Copie spike/.env.example para spike/.env.local e preencha com o ID e a chave secreta do seu app da Meta\n" +
            "(guia: docs/fase-0/criar-app-meta.md)."),
    );
  }

  if (cfg.tokenExpiresAt) {
    const daysLeft = (new Date(cfg.tokenExpiresAt).getTime() - Date.now()) / 86_400_000;
    if (daysLeft < 0) fail("Seu token da Meta expirou. Rode `npm run login` de novo.");
    if (daysLeft < 7) console.warn(`⚠  Seu token expira em ${Math.ceil(daysLeft)} dia(s).`);
  }
  return cfg;
}

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

export function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** Lê --flag valor / --flag=valor dos argumentos da linha de comando. */
export function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === `--${name}`) return argv[i + 1];
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}
