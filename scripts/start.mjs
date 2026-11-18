#!/usr/bin/env node
/**
 * `npm start` do Migra Ads — funciona igual no macOS, Windows e Linux.
 *
 * 1. Confere a versão do Node.
 * 2. Faz o build se ainda não existe ou se o código mudou (ex.: depois de um `git pull`).
 * 3. Sobe o servidor SOMENTE em 127.0.0.1 (ninguém da rede acessa).
 * 4. Espera o app responder e abre o navegador.
 *
 * Opções:  --no-open (não abre o navegador)   --rebuild (força um build novo)
 * Porta:   PORT=3000 (padrão; o login com Facebook volta para esta porta)
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const URL_LOCAL = `http://localhost:${PORT}`;
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const STAMP_FILE = path.join(ROOT, ".next", "migra-build-stamp");
const args = new Set(process.argv.slice(2));

const say = (msg) => console.log(`\x1b[34m▸\x1b[0m ${msg}`);
const die = (msg) => {
  console.error(`\n\x1b[31m✖ ${msg}\x1b[0m\n`);
  process.exit(1);
};

// 1. Node
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) {
  die(`O Migra Ads precisa do Node.js 20.9 ou mais novo. Você tem ${process.versions.node}. Baixe em https://nodejs.org`);
}
if (!existsSync(NEXT_BIN)) die("Dependências não instaladas. Rode `npm install` primeiro.");

// 2. Build quando necessário
const stamp = fingerprint();
const built = existsSync(path.join(ROOT, ".next", "BUILD_ID"));
const stale = !built || !existsSync(STAMP_FILE) || readFileSync(STAMP_FILE, "utf8") !== stamp;
if (args.has("--rebuild") || stale) {
  say(built ? "O código mudou. Preparando o app de novo (leva ~1 min)…" : "Primeira vez: preparando o app (leva ~1 min)…");
  const r = spawnSync(process.execPath, [NEXT_BIN, "build"], { cwd: ROOT, stdio: "inherit", env: process.env });
  if (r.status !== 0) die("O build falhou. Veja o erro acima.");
  writeFileSync(STAMP_FILE, stamp);
}

// 3. Porta livre?
await new Promise((resolve) => {
  const probe = createServer()
    .once("error", (e) => {
      if (e.code === "EADDRINUSE") {
        die(
          `A porta ${PORT} já está em uso. O Migra Ads já está aberto? Acesse ${URL_LOCAL}\n` +
            `  Ou feche o programa que usa a porta ${PORT}. (O login com Facebook precisa desta porta.)`,
        );
      }
      die(e.message);
    })
    .once("listening", () => probe.close(resolve))
    .listen(PORT, HOST);
});

say(`Iniciando o Migra Ads em ${URL_LOCAL} …`);
const server = spawn(process.execPath, [NEXT_BIN, "start", "-H", HOST, "-p", String(PORT)], {
  cwd: ROOT,
  stdio: ["ignore", "inherit", "inherit"],
  // PORT vai junto: a tela de conexão mostra o endereço de retorno do login com esta porta.
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
});

const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));

// 4. Espera responder e abre o navegador
if (await waitHealthy(60_000)) {
  console.log(`\n  \x1b[1m✔ Migra Ads pronto:\x1b[0m ${URL_LOCAL}\n  Para fechar, aperte Ctrl + C neste terminal.\n`);
  if (!args.has("--no-open")) openBrowser(URL_LOCAL);
} else {
  console.warn(`⚠  O app demorou para responder. Tente abrir ${URL_LOCAL} manualmente.`);
}

async function waitHealthy(timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://${HOST}:${PORT}/api/health`);
      if (res.ok) return true;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  const child = spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true });
  child.on("error", () => console.log(`Abra no navegador: ${url}`));
  child.unref();
}

/** Impressão digital do código: muda quando qualquer arquivo do app muda. Não depende do Git. */
function fingerprint() {
  const hash = createHash("sha1");
  const files = ["package-lock.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs"];
  const dirs = ["src", "public", "drizzle"];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(path.relative(ROOT, full));
    }
  };
  dirs.forEach((d) => walk(path.join(ROOT, d)));
  for (const f of files.sort()) {
    const full = path.join(ROOT, f);
    if (!existsSync(full)) continue;
    const st = statSync(full);
    hash.update(`${f.split(path.sep).join("/")}:${st.size}:${Math.floor(st.mtimeMs)}\n`);
  }
  return hash.digest("hex");
}
