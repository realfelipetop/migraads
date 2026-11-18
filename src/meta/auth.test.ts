import { describe, expect, it } from "vitest";
import { buildLoginUrl, effectiveExpiry, redirectUri } from "./auth";

const NOW = Date.UTC(2026, 10, 12);
const sec = (iso: string) => Date.parse(iso) / 1000;

describe("prazo da conexão", () => {
  it("token que não expira (expires_at 0) usa o prazo do acesso aos dados — caso real da Fase 2", () => {
    expect(effectiveExpiry({ expires_at: 0, data_access_expires_at: sec("2027-02-10T00:00:00Z") }, undefined, NOW)).toBe(
      "2027-02-10T00:00:00.000Z",
    );
  });

  it("usa o menor prazo entre token, troca e acesso aos dados", () => {
    const r = effectiveExpiry(
      { expires_at: sec("2027-01-11T00:00:00Z"), data_access_expires_at: sec("2027-02-10T00:00:00Z") },
      60 * 86400,
      NOW,
    );
    expect(r).toBe("2027-01-11T00:00:00.000Z");
  });

  it("sem nenhum prazo (usuário do sistema) → não expira", () => {
    expect(effectiveExpiry({ expires_at: 0 }, undefined, NOW)).toBeNull();
  });
});

describe("login", () => {
  const app = { appId: "123", appSecret: "x" };

  it("volta sempre para localhost na porta do app", () => {
    expect(redirectUri(3000)).toBe("http://localhost:3000/api/auth/callback");
  });

  it("pede as permissões quando não há configuração de login", () => {
    const url = new URL(buildLoginUrl(app, redirectUri(3000), "estado"));
    expect(url.searchParams.get("scope")).toContain("ads_management");
    expect(url.searchParams.get("state")).toBe("estado");
    expect(url.searchParams.has("config_id")).toBe(false);
  });

  it("usa config_id no Login do Facebook para Empresas", () => {
    const url = new URL(buildLoginUrl({ ...app, loginConfigId: "999" }, redirectUri(3000), "s"));
    expect(url.searchParams.get("config_id")).toBe("999");
    expect(url.searchParams.has("scope")).toBe(false);
  });

  it("nunca coloca a chave secreta na URL de login", () => {
    expect(buildLoginUrl({ appId: "123", appSecret: "segredo" }, redirectUri(3000), "s")).not.toContain("segredo");
  });
});
