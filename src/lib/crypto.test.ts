import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

describe("criptografia local", () => {
  it("criptografa e descriptografa", () => {
    const token = "EAAtokenDeTeste1234567890";
    const enc = encrypt(token);
    expect(enc).not.toContain(token);
    expect(decrypt(enc)).toBe(token);
  });

  it("gera um texto diferente a cada vez (IV aleatório)", () => {
    expect(encrypt("mesmo texto")).not.toBe(encrypt("mesmo texto"));
  });

  it("recusa conteúdo adulterado", () => {
    const [v, iv, tag, data] = encrypt("segredo").split(":");
    const tampered = Buffer.from(data, "base64");
    tampered[0] ^= 0xff;
    expect(() => decrypt([v, iv, tag, tampered.toString("base64")].join(":"))).toThrow();
  });

  it("guarda a chave em data/secret.key", () => {
    encrypt("x");
    const key = readFileSync(path.join(process.env.MIGRA_DATA_DIR!, "secret.key"), "utf8");
    expect(Buffer.from(key, "base64")).toHaveLength(32);
  });
});
