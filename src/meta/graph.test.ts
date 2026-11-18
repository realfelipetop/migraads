import { describe, expect, it, vi } from "vitest";
import { Graph, GraphError, removeField } from "./graph";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const metaError = (code: number, message: string, subcode?: number) =>
  json({ error: { code, message, error_subcode: subcode, type: "OAuthException" } }, 400);

describe("removeField", () => {
  it.each([
    ["id,name,advantage_state_info,status", "advantage_state_info", "id,name,status"],
    ["id,creative{id,body,contextual_multi_ads},name", "contextual_multi_ads", "id,creative{id,body},name"],
    ["business{id,name},id", "business", "id"],
    ["id,name_x,name", "name", "id,name_x"],
  ])("%s − %s", (input, field, expected) => {
    expect(removeField(input, field)).toBe(expected);
  });
});

describe("Graph", () => {
  it("remove sozinho campos que não existem na versão da API", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return urls.length === 1
        ? metaError(100, "(#100) Tried accessing nonexisting field (velho) on node type (Campaign)")
        : json({ id: "1", name: "Campanha" });
    }) as unknown as typeof fetch;
    const g = new Graph({ accessToken: "t", fetchImpl });
    const res = await g.get<{ name: string }>("1", { fields: "id,velho,name" }, "Campaign");
    expect(res.name).toBe("Campanha");
    expect(new URL(urls[1]).searchParams.get("fields")).toBe("id,name");
    expect([...g.strippedFields.get("Campaign")!]).toEqual(["velho"]);
  });

  it("espera e tenta de novo no limite de chamadas", async () => {
    let calls = 0;
    const fetchImpl = (async () => (++calls === 1 ? metaError(17, "User request limit reached", 2446079) : json({ ok: true }))) as unknown as typeof fetch;
    const waits: number[] = [];
    const g = new Graph({ accessToken: "t", fetchImpl, sleep: async (ms) => void waits.push(ms), onWait: () => {} });
    await expect(g.get("me")).resolves.toEqual({ ok: true });
    expect(waits).toHaveLength(1);
  });

  it("percorre todas as páginas e diminui a página quando a Meta pede", async () => {
    const limits: number[] = [];
    const fetchImpl = (async (url: string) => {
      const u = new URL(url);
      limits.push(Number(u.searchParams.get("limit")));
      if (limits.length === 1) return metaError(1, "Please reduce the amount of data you're asking for", 99);
      return u.searchParams.get("after")
        ? json({ data: [{ id: "b" }], paging: {} })
        : json({ data: [{ id: "a" }], paging: { next: "x", cursors: { after: "c1" } } });
    }) as unknown as typeof fetch;
    const g = new Graph({ accessToken: "t", fetchImpl });
    const all = await g.getAll<{ id: string }>("act_1/campaigns", { limit: 100 });
    expect(all.map((x) => x.id)).toEqual(["a", "b"]);
    expect(limits[1]).toBe(50);
  });

  it("nunca coloca o token na mensagem de erro", async () => {
    const fetchImpl = (async () => metaError(190, "Invalid OAuth access token")) as unknown as typeof fetch;
    const g = new Graph({ accessToken: "EAAsegredo", fetchImpl });
    const err = (await g.get("me").catch((e: unknown) => e)) as GraphError;
    expect(err).toBeInstanceOf(GraphError);
    expect(err.describe()).not.toContain("EAAsegredo");
  });
});
