import { describe, expect, it } from "vitest";
import { buildTree, type RawAccount } from "./accounts";

const acc = (id: string, name: string, status = 1, business?: { id: string; name: string }): RawAccount => ({
  id: `act_${id}`,
  account_id: id,
  name,
  account_status: status,
  currency: "BRL",
  timezone_name: "America/Sao_Paulo",
  business,
});

const MAIN = { id: "b1", name: "BM Principal" };
const OUTRA = { id: "b2", name: "BM Clientes" };

describe("buildTree (seletor igual ao do Gerenciador)", () => {
  const tree = buildTree({
    me: { id: "u1", name: "Fulano" },
    all: [acc("1", "Pessoal B"), acc("2", "Pessoal A"), acc("3", "Da BM Principal", 1, MAIN)],
    businesses: [
      { id: "b1", name: "BM Principal", owned: [acc("3", "Da BM Principal", 1, MAIN)], client: [acc("4", "CA2", 2, OUTRA), acc("1", "Pessoal B")] },
      { id: "b0", name: " ", owned: [], client: [] },
    ],
    fetchedAt: "2026-11-12T00:00:00.000Z",
  });

  it("separa contas pessoais (sem BM), em ordem alfabética", () => {
    expect(tree.personal.map((a) => a.name)).toEqual(["Pessoal A", "Pessoal B"]);
  });

  it("mantém contas compartilhadas com a dona e o status em português", () => {
    const main = tree.businesses.find((b) => b.id === "b1")!;
    expect(main.owned.map((a) => a.accountId)).toEqual(["3"]);
    const ca2 = main.client.find((a) => a.accountId === "4")!;
    expect(ca2.owner?.name).toBe("BM Clientes");
    expect(ca2.statusLabel).toBe("Desativada");
    expect(ca2.active).toBe(false);
  });

  it("dá nome a portfólio sem nome", () => {
    expect(tree.businesses.find((b) => b.id === "b0")!.name).toBe("Portfólio b0");
  });

  it("conta as contas diferentes do seletor (inclui as das BMs, sem repetir)", () => {
    expect(tree.total).toBe(4); // 1, 2, 3 e a CA2 compartilhada; a "Pessoal B" compartilhada não conta duas vezes
  });
});
