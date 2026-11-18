import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { friendlyError } from "./errors";
import { GraphError } from "./graph";
import { deleteConnection, getAppConfig, getConnection, getConnectionStatus, saveAppConfig, saveConnection } from "./store";

const SECRET = "0123456789abcdef0123456789abcdef";
const TOKEN = "EAAtokenDeTesteMuitoLongo";

describe("credenciais e conexão", () => {
  it("sem app configurado → app_missing", () => {
    expect(getConnectionStatus().state).toBe("app_missing");
  });

  it("guarda a chave secreta criptografada no banco", () => {
    saveAppConfig({ appId: "123", appSecret: SECRET, appName: "Teste" });
    const raw = JSON.stringify(getDb().select().from(schema.settings).where(eq(schema.settings.key, "meta_app")).get());
    expect(raw).not.toContain(SECRET);
    expect(getAppConfig()?.appSecret).toBe(SECRET);
    expect(getConnectionStatus().state).toBe("disconnected");
  });

  it("guarda o token criptografado e substitui a conexão anterior", () => {
    const base = { kind: "user" as const, appId: "123", metaUserId: "u", metaUserName: "Fulano", scopes: ["ads_read"] };
    saveConnection({ ...base, token: "antigo", expiresAt: null });
    saveConnection({ ...base, token: TOKEN, expiresAt: "2026-12-31T00:00:00.000Z" });
    const rows = getDb().select().from(schema.connections).all();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(TOKEN);
    expect(getConnection()?.token).toBe(TOKEN);
  });

  it("calcula ok / expirando / expirada", () => {
    const now = new Date("2026-12-01T00:00:00.000Z").getTime();
    expect(getConnectionStatus(now)).toMatchObject({ state: "ok", daysLeft: 30, userName: "Fulano" });
    expect(getConnectionStatus(new Date("2026-12-28T00:00:00.000Z").getTime())).toMatchObject({ state: "expiring", daysLeft: 3 });
    expect(getConnectionStatus(new Date("2027-01-02T00:00:00.000Z").getTime()).state).toBe("expired");
  });

  it("o status nunca expõe o token", () => {
    expect(JSON.stringify(getConnectionStatus())).not.toContain(TOKEN);
  });

  it("desconectar apaga o token", () => {
    deleteConnection();
    expect(getConnection()).toBeNull();
  });
});

describe("mensagens de erro em português", () => {
  it("chave secreta errada (o erro real da Fase 0)", () => {
    expect(friendlyError(new GraphError("Error validating client secret.", 400, 1))).toMatch(/chave secreta não conferem/);
  });
  it("token expirado", () => {
    expect(friendlyError(new GraphError("Session has expired", 400, 190, 463))).toMatch(/expirou/);
  });
  it("limite de chamadas", () => {
    expect(friendlyError(new GraphError("User request limit reached", 400, 17))).toMatch(/mais devagar/);
  });
});
