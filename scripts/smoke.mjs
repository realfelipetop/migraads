#!/usr/bin/env node
/**
 * Teste de fumaça (usado no CI em macOS, Windows e Linux):
 * roda o `npm start` de verdade, espera o app responder e confere as telas principais.
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT || "3123";
const BASE = `http://127.0.0.1:${PORT}`;

const app = spawn(process.execPath, [path.join(ROOT, "scripts", "start.mjs"), "--no-open"], {
  cwd: ROOT,
  env: { ...process.env, PORT, MIGRA_DATA_DIR: path.join(ROOT, "data", "smoke") },
  stdio: "inherit",
  detached: process.platform !== "win32",
});

function killTree() {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-app.pid, "SIGTERM");
    } catch {
      /* já saiu */
    }
  }
}

async function get(pathname) {
  const res = await fetch(BASE + pathname);
  return { status: res.status, body: await res.text() };
}

let failed = false;
try {
  const until = Date.now() + 240_000; // inclui o primeiro build
  let healthy = false;
  while (Date.now() < until && !healthy) {
    try {
      healthy = (await get("/api/health")).status === 200;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!healthy) throw new Error("o app não respondeu em /api/health");

  const health = JSON.parse((await get("/api/health")).body);
  console.log("✔ /api/health", health);
  if (!health.ok || health.db?.tables < 13) throw new Error("banco local não inicializou");

  for (const [page, text] of [
    ["/", "Bem-vindo ao Migra Ads"],
    ["/estrutura-recomendada", "BM mãe"],
    ["/sobre", "Felipe Top"],
    ["/configuracoes", "Pasta de dados"],
    ["/conectar", "Crie o seu app na Meta"], // pasta de dados nova → assistente desde o passo 1
    ["/migrar", "Conecte sua conta da Meta primeiro"],
    ["/migracoes", "Nenhuma migração ainda"],
  ]) {
    const r = await get(page);
    if (r.status !== 200 || !r.body.includes(text)) throw new Error(`${page} → ${r.status}, sem "${text}"`);
    console.log(`✔ ${page}`);
  }

  // Sem app configurado, o login volta para o assistente em vez de ir para a Meta.
  const login = await fetch(`http://localhost:${PORT}/api/auth/login`, { redirect: "manual" });
  const to = login.headers.get("location") ?? "";
  if (login.status !== 302 || !to.includes("/conectar?erro=app")) throw new Error(`/api/auth/login → ${login.status} ${to}`);
  console.log("✔ /api/auth/login sem app → assistente");
} catch (e) {
  failed = true;
  console.error(`✖ Smoke test falhou: ${e.message}`);
} finally {
  killTree();
}
process.exit(failed ? 1 : 0);
