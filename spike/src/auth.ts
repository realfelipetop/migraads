import { spawn } from "node:child_process";
import { graphPublic, GraphError } from "./graph.js";
import { saveEnv, type Config } from "./env.js";

export const SCOPES = [
  "ads_management",
  "ads_read",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
];

/**
 * Recebe um token (curto ou longo), troca por um de longa duração quando possível,
 * confere permissões e salva no .env.local. Nunca imprime o token.
 */
export async function finalizeToken(cfg: Config, token: string): Promise<void> {
  let finalToken = token;
  let expiresAt: string | undefined;

  try {
    const exchanged = await graphPublic(cfg.apiVersion, "oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
      fb_exchange_token: token,
    });
    finalToken = exchanged.access_token;
    if (exchanged.expires_in) expiresAt = new Date(Date.now() + exchanged.expires_in * 1000).toISOString();
    console.log("✔ Token trocado por um de longa duração.");
  } catch (e) {
    const msg = e instanceof GraphError ? e.message : String(e);
    console.warn(`⚠  Não deu para trocar por token de longa duração (${msg}). Vou usar o token como veio.`);
  }

  const info = await debugToken(cfg, finalToken);
  if (!info.is_valid) throw new Error("A Meta diz que esse token não é válido.");
  if (info.app_id && info.app_id !== cfg.appId) {
    throw new Error(`Esse token é de outro app (${info.app_id}), não do META_APP_ID configurado (${cfg.appId}).`);
  }
  if (!expiresAt && info.expires_at) expiresAt = new Date(info.expires_at * 1000).toISOString();

  saveEnv({ META_ACCESS_TOKEN: finalToken, META_TOKEN_EXPIRES_AT: expiresAt ?? "" });

  const granted: string[] = info.scopes ?? [];
  const missing = SCOPES.filter((s) => !granted.includes(s));
  console.log(`\n✔ Conectado. Token salvo em spike/.env.local (fora do Git).`);
  console.log(`  Tipo: ${info.type ?? "?"} · App: ${info.application ?? info.app_id}`);
  console.log(`  Expira: ${expiresAt ? new Date(expiresAt).toLocaleString("pt-BR") : "não expira"}`);
  console.log(`  Permissões concedidas: ${granted.join(", ") || "(nenhuma informada)"}`);
  if (missing.length) {
    console.warn(`\n⚠  Faltam permissões: ${missing.join(", ")}.`);
    console.warn("   Alguns testes podem falhar. Gere o token de novo marcando essas permissões.");
  }
  console.log("\nPróximo passo: npm run accounts\n");
}

async function debugToken(cfg: Config, token: string): Promise<any> {
  const res = await graphPublic(cfg.apiVersion, "debug_token", {
    input_token: token,
    access_token: `${cfg.appId}|${cfg.appSecret}`,
  });
  return res.data ?? {};
}

export function openBrowser(url: string): void {
  const p = process.platform;
  const child =
    p === "darwin"
      ? spawn("open", [url], { stdio: "ignore", detached: true })
      : p === "win32"
        ? spawn("rundll32", ["url.dll,FileProtocolHandler", url], { stdio: "ignore", detached: true })
        : spawn("xdg-open", [url], { stdio: "ignore", detached: true });
  child.on("error", () => console.log(`Abra este endereço no navegador:\n${url}`));
  child.unref();
}
