/**
 * Fase 0 · Pergunta 1: o login com Facebook aceita voltar para localhost?
 *
 * Sobe um servidor em http://localhost:3000, abre o navegador no login da Meta
 * e recebe o código de volta em /api/auth/callback.
 *
 * Uso: npm run login
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { loadConfig, REDIRECT_PORT, REDIRECT_URI, fail } from "./env.js";
import { graphPublic, GraphError } from "./graph.js";
import { finalizeToken, openBrowser, SCOPES } from "./auth.js";

const cfg = loadConfig();
const state = randomBytes(16).toString("hex");

const dialog = new URL(`https://www.facebook.com/${cfg.apiVersion}/dialog/oauth`);
dialog.searchParams.set("client_id", cfg.appId);
dialog.searchParams.set("redirect_uri", REDIRECT_URI);
dialog.searchParams.set("state", state);
dialog.searchParams.set("response_type", "code");
if (cfg.loginConfigId) dialog.searchParams.set("config_id", cfg.loginConfigId);
else dialog.searchParams.set("scope", SCOPES.join(","));

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>Migra Ads</title>
  <body style="font-family:system-ui;max-width:560px;margin:80px auto;padding:0 16px;color:#1c1e21">
  <h2 style="color:#1D6FE0">${title}</h2><p>${body}</p></body>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${REDIRECT_PORT}`);
  if (url.pathname !== "/api/auth/callback") {
    res.writeHead(404).end();
    return;
  }

  const send = (status: number, title: string, body: string) => {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(page(title, body));
  };

  if (url.searchParams.get("error")) {
    const reason = url.searchParams.get("error_description") ?? url.searchParams.get("error");
    send(400, "Login cancelado", `A Meta respondeu: ${reason}`);
    return finish(`Login não concluído: ${reason}`);
  }
  if (url.searchParams.get("state") !== state) {
    send(400, "Algo estranho", "O parâmetro de segurança não confere. Rode o login de novo.");
    return finish("State inválido — login ignorado por segurança.");
  }

  const code = url.searchParams.get("code");
  if (!code) {
    send(400, "Sem código", "A Meta não devolveu o código de login.");
    return finish("Sem código de autorização.");
  }

  try {
    const short = await graphPublic(cfg.apiVersion, "oauth/access_token", {
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
      redirect_uri: REDIRECT_URI,
      code,
    });
    console.log("\n✔ RESULTADO FASE 0 · P1: o login voltou para localhost com sucesso.");
    await finalizeToken(cfg, short.access_token);
    send(200, "Conectado ✔", "Pode fechar esta aba e voltar para o terminal.");
    finish();
  } catch (e) {
    const msg = e instanceof GraphError ? e.describe() : (e as Error).message;
    send(500, "Erro ao concluir o login", msg);
    finish(msg);
  }
});

function finish(error?: string) {
  setTimeout(() => {
    server.close();
    if (error) fail(error);
    process.exit(0);
  }, 300);
}

server.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EADDRINUSE") fail(`A porta ${REDIRECT_PORT} já está em uso. Feche o que estiver rodando nela e tente de novo.`);
  fail(e.message);
});

server.listen(REDIRECT_PORT, "127.0.0.1", () => {
  console.log(`Abrindo o login da Meta no navegador…`);
  console.log(`Endereço de retorno: ${REDIRECT_URI}`);
  console.log(`(Se o navegador não abrir, copie este link:)\n${dialog.toString()}\n`);
  console.log("Se aparecer \"URL bloqueada\" ou \"redirect_uri inválido\", anote: é o achado da Fase 0 ·");
  console.log("P1. Nesse caso use o plano B: npm run token\n");
  openBrowser(dialog.toString());
});

// Desiste depois de 5 minutos sem resposta.
setTimeout(() => finish("Tempo esgotado esperando o login (5 min)."), 5 * 60_000).unref();
