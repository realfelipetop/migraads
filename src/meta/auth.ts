import { META_API_VERSION } from "@/config/brand";
import { Graph, graphPublic } from "./graph";
import { OAUTH_SCOPES } from "./fields";
import { saveConnection, type AppConfig } from "./store";

/** Cookie de segurança do login (protege contra login forjado vindo de outra página). */
export const STATE_COOKIE = "migra_oauth_state";

/** Endereço de retorno do login. Precisa ser IGUAL ao cadastrado no app da Meta. */
export function redirectUri(port: string | number): string {
  return `http://localhost:${port}/api/auth/callback`;
}

export function buildLoginUrl(app: AppConfig, redirect: string, state: string): string {
  const url = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", app.appId);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  if (app.loginConfigId) url.searchParams.set("config_id", app.loginConfigId);
  else url.searchParams.set("scope", OAUTH_SCOPES.join(","));
  return url.toString();
}

/** Confere ID + chave secreta com a Meta. Devolve o nome do app. */
export async function validateApp(appId: string, appSecret: string): Promise<string> {
  const app = await graphPublic<{ id: string; name: string }>(appId, {
    fields: "id,name",
    access_token: `${appId}|${appSecret}`,
  });
  return app.name;
}

export async function exchangeCode(app: AppConfig, code: string, redirect: string): Promise<string> {
  const res = await graphPublic<{ access_token: string }>("oauth/access_token", {
    client_id: app.appId,
    client_secret: app.appSecret,
    redirect_uri: redirect,
    code,
  });
  return res.access_token;
}

export interface DebugToken {
  is_valid?: boolean;
  app_id?: string;
  type?: string;
  /** 0 = o token em si não expira. */
  expires_at?: number;
  /** Até quando o app pode ler os dados do usuário. Depois disso é preciso reconectar. */
  data_access_expires_at?: number;
  scopes?: string[];
}

/**
 * Prazo real da conexão = o MENOR entre a validade do token e a validade do acesso aos dados.
 * Achado da Fase 2: o token longo deste app veio com expires_at = 0 (não expira), mas com
 * data_access_expires_at em 90 dias — e é esse prazo que obriga a reconectar.
 */
export function effectiveExpiry(info: DebugToken, exchangedExpiresInSec?: number, now = Date.now()): string | null {
  const candidates = [
    exchangedExpiresInSec ? now + exchangedExpiresInSec * 1000 : 0,
    (info.expires_at ?? 0) * 1000,
    (info.data_access_expires_at ?? 0) * 1000,
  ].filter((ms) => ms > 0);
  return candidates.length ? new Date(Math.min(...candidates)).toISOString() : null;
}

export interface FinalizeResult {
  userName: string;
  expiresAt: string | null;
  scopes: string[];
  missingScopes: string[];
  longLived: boolean;
}

/**
 * Recebe um token (do login ou colado), troca por um de longa duração quando possível,
 * confere com a Meta e salva criptografado. Nunca registra o token.
 */
export async function finalizeToken(app: AppConfig, token: string): Promise<FinalizeResult> {
  let finalToken = token;
  let expiresIn: number | undefined;
  let longLived = false;

  try {
    const ex = await graphPublic<{ access_token: string; expires_in?: number }>("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: app.appId,
      client_secret: app.appSecret,
      fb_exchange_token: token,
    });
    finalToken = ex.access_token;
    longLived = true;
    expiresIn = ex.expires_in;
  } catch {
    // Token de usuário do sistema não é trocável: segue com o original.
  }

  const { data: info = {} } = await graphPublic<{ data?: DebugToken }>("debug_token", {
    input_token: finalToken,
    access_token: `${app.appId}|${app.appSecret}`,
  });
  if (!info.is_valid) throw new Error("A Meta diz que esse token não é válido. Gere um novo e tente de novo.");
  if (info.app_id && info.app_id !== app.appId) {
    throw new Error(`Esse token é de outro app (${info.app_id}), não do app configurado (${app.appId}).`);
  }
  const expiresAt = effectiveExpiry(info, expiresIn);

  const me = await new Graph({ accessToken: finalToken, appSecret: app.appSecret }).get<{ id: string; name: string }>(
    "me",
    { fields: "id,name" },
  );

  const scopes = info.scopes ?? [];
  saveConnection({
    kind: info.type === "SYSTEM_USER" ? "system_user" : "user",
    appId: app.appId,
    metaUserId: me.id,
    metaUserName: me.name,
    token: finalToken,
    expiresAt,
    scopes,
  });

  return {
    userName: me.name,
    expiresAt,
    scopes,
    missingScopes: OAUTH_SCOPES.filter((s) => !scopes.includes(s)),
    longLived,
  };
}
