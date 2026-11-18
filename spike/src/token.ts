/**
 * Plano B do login: colar um token gerado no Graph API Explorer.
 *
 * Uso: npm run token
 * (o token é pedido no terminal para não ficar no histórico do shell)
 */
import { createInterface } from "node:readline/promises";
import { loadConfig, fail } from "./env.js";
import { finalizeToken } from "./auth.js";
import { GraphError } from "./graph.js";

const cfg = loadConfig();

console.log("Cole o token gerado no Graph API Explorer (developers.facebook.com/tools/explorer)");
console.log("e aperte Enter. Ele vai direto para o spike/.env.local e não aparece em nenhum log.\n");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const token = (await rl.question("Token: ")).trim();
rl.close();

if (!token) fail("Nenhum token informado.");

try {
  await finalizeToken(cfg, token);
} catch (e) {
  fail(e instanceof GraphError ? e.describe() : (e as Error).message);
}
