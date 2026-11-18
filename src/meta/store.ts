import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { Graph } from "./graph";

/**
 * Onde ficam as credenciais do app da Meta e a conexão do usuário.
 * Tudo que é segredo (chave secreta do app, token) vai criptografado para o banco.
 * NUNCA devolva token ou chave secreta para componentes de cliente — use `getConnectionStatus()`.
 */

export interface AppConfig {
  appId: string;
  appSecret: string;
  loginConfigId?: string;
  appName?: string;
}

interface StoredAppConfig {
  appId: string;
  appSecretEncrypted: string;
  loginConfigId?: string;
  appName?: string;
}

const APP_KEY = "meta_app";

export function getAppConfig(): AppConfig | null {
  const row = getDb().select().from(schema.settings).where(eq(schema.settings.key, APP_KEY)).get();
  const v = row?.value as StoredAppConfig | undefined;
  if (!v?.appId || !v.appSecretEncrypted) return null;
  return { appId: v.appId, appSecret: decrypt(v.appSecretEncrypted), loginConfigId: v.loginConfigId, appName: v.appName };
}

export function saveAppConfig(cfg: AppConfig) {
  const value: StoredAppConfig = {
    appId: cfg.appId,
    appSecretEncrypted: encrypt(cfg.appSecret),
    loginConfigId: cfg.loginConfigId || undefined,
    appName: cfg.appName,
  };
  getDb()
    .insert(schema.settings)
    .values({ key: APP_KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}

export interface Connection {
  id: string;
  kind: "user" | "system_user";
  appId: string;
  metaUserId: string | null;
  metaUserName: string | null;
  token: string;
  expiresAt: string | null;
  scopes: string[];
}

export function getConnection(): Connection | null {
  const row = getDb().select().from(schema.connections).orderBy(desc(schema.connections.createdAt)).get();
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    appId: row.appId,
    metaUserId: row.metaUserId,
    metaUserName: row.metaUserName,
    token: decrypt(row.tokenEncrypted),
    expiresAt: row.tokenExpiresAt,
    scopes: row.scopes ?? [],
  };
}

/** Só existe uma conexão ativa: salvar uma nova substitui a anterior. */
export function saveConnection(c: Omit<Connection, "id">) {
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(schema.connections).run();
    tx.insert(schema.connections)
      .values({
        kind: c.kind,
        appId: c.appId,
        metaUserId: c.metaUserId,
        metaUserName: c.metaUserName,
        tokenEncrypted: encrypt(c.token),
        tokenExpiresAt: c.expiresAt,
        scopes: c.scopes,
      })
      .run();
  });
}

export function deleteConnection() {
  getDb().delete(schema.connections).run();
}

export type ConnectionState = "app_missing" | "disconnected" | "ok" | "expiring" | "expired";

/** Informação segura (sem token) para mostrar na tela. */
export interface ConnectionStatus {
  state: ConnectionState;
  appId?: string;
  appName?: string;
  userName?: string | null;
  expiresAt?: string | null;
  daysLeft?: number | null;
  scopes?: string[];
  kind?: Connection["kind"];
}

export const EXPIRING_DAYS = 7;

export function getConnectionStatus(now = Date.now()): ConnectionStatus {
  const app = getAppConfig();
  if (!app) return { state: "app_missing" };
  const conn = getConnection();
  if (!conn) return { state: "disconnected", appId: app.appId, appName: app.appName };
  const daysLeft = conn.expiresAt ? (new Date(conn.expiresAt).getTime() - now) / 86_400_000 : null;
  const state: ConnectionState =
    daysLeft === null ? "ok" : daysLeft <= 0 ? "expired" : daysLeft < EXPIRING_DAYS ? "expiring" : "ok";
  return {
    state,
    appId: app.appId,
    appName: app.appName,
    userName: conn.metaUserName,
    expiresAt: conn.expiresAt,
    daysLeft: daysLeft === null ? null : Math.max(0, Math.ceil(daysLeft)),
    scopes: conn.scopes,
    kind: conn.kind,
  };
}

/** Cliente da Graph API usando a conexão salva. */
export function getGraph(opts: { onWait?: (minutes: number, code: number) => void } = {}): Graph {
  const app = getAppConfig();
  const conn = getConnection();
  if (!app || !conn) throw new Error("Conecte sua conta da Meta primeiro.");
  return new Graph({ accessToken: conn.token, appSecret: app.appSecret, onWait: opts.onWait });
}
