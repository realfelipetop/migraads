import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ACCOUNT_FIELDS, ACCOUNT_STATUS } from "./fields";
import type { Graph } from "./graph";

/** Formato do seletor de contas, igual ao do Gerenciador: "A tua conta" + portfólios de negócios. */

export interface AccountSummary {
  id: string; // act_123
  accountId: string;
  name: string;
  status: number;
  statusLabel: string;
  active: boolean;
  currency: string;
  timezone: string;
  owner?: { id: string; name: string };
}

export interface BusinessNode {
  id: string;
  name: string;
  owned: AccountSummary[];
  /** Contas de outras BMs (ou pessoais) compartilhadas com esta BM. */
  client: AccountSummary[];
}

export interface AccountTree {
  me: { id: string; name: string };
  personal: AccountSummary[];
  businesses: BusinessNode[];
  total: number;
  fetchedAt: string;
}

export interface RawAccount {
  id: string;
  account_id: string;
  name?: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  business?: { id: string; name: string };
}

export function summarize(a: RawAccount): AccountSummary {
  return {
    id: a.id,
    accountId: a.account_id,
    name: a.name || a.account_id,
    status: a.account_status,
    statusLabel: ACCOUNT_STATUS[a.account_status] ?? `Status ${a.account_status}`,
    active: a.account_status === 1 || a.account_status === 201,
    currency: a.currency,
    timezone: a.timezone_name,
    owner: a.business,
  };
}

/** Monta a árvore a partir das respostas da API. Função pura (testada). */
export function buildTree(input: {
  me: { id: string; name: string };
  all: RawAccount[];
  businesses: { id: string; name: string; owned: RawAccount[]; client: RawAccount[] }[];
  fetchedAt?: string;
}): AccountTree {
  const byName = (a: AccountSummary, b: AccountSummary) => a.name.localeCompare(b.name, "pt-BR");
  // Total = contas diferentes que aparecem no seletor. É maior que me/adaccounts, porque inclui
  // contas das BMs que não estão atribuídas diretamente ao usuário (achado da Fase 2: 23 vs 19).
  const unique = new Set([...input.all, ...input.businesses.flatMap((b) => [...b.owned, ...b.client])].map((a) => a.id));
  return {
    me: input.me,
    personal: input.all.filter((a) => !a.business).map(summarize).sort(byName),
    businesses: input.businesses
      .map((b) => ({
        id: b.id,
        name: b.name?.trim() || `Portfólio ${b.id}`,
        owned: b.owned.map(summarize).sort(byName),
        client: b.client.map(summarize).sort(byName),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    total: unique.size,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
  };
}

/** Lê tudo que o token enxerga (~2 chamadas + 2 por BM). */
export async function fetchAccountTree(graph: Graph): Promise<AccountTree> {
  const me = await graph.get<{ id: string; name: string }>("me", { fields: "id,name" });
  const all = await graph.getAll<RawAccount>("me/adaccounts", { fields: ACCOUNT_FIELDS }, "AdAccount");
  const bms = await graph.getAll<{ id: string; name: string }>("me/businesses", { fields: "id,name" }, "Business");
  const safe = (path: string) =>
    graph.getAll<RawAccount>(path, { fields: ACCOUNT_FIELDS }, "AdAccount").catch(() => [] as RawAccount[]);
  const businesses = [];
  for (const bm of bms) {
    businesses.push({ ...bm, owned: await safe(`${bm.id}/owned_ad_accounts`), client: await safe(`${bm.id}/client_ad_accounts`) });
  }
  return buildTree({ me, all, businesses });
}

const TREE_KEY = "accounts_tree";

export function saveAccountTree(tree: AccountTree) {
  const db = getDb();
  db.transaction((tx) => {
    tx.insert(schema.settings)
      .values({ key: TREE_KEY, value: tree })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: tree } })
      .run();

    // Cache plano (uma linha por conta) para consultas rápidas nas próximas fases.
    tx.delete(schema.accountsCache).run();
    const seen = new Set<string>();
    const rows: (typeof schema.accountsCache.$inferInsert)[] = [];
    const push = (a: AccountSummary, kind: "personal" | "owned" | "client") => {
      if (seen.has(a.id)) return;
      seen.add(a.id);
      rows.push({
        id: a.id,
        accountId: a.accountId,
        name: a.name,
        status: a.status,
        currency: a.currency,
        timezone: a.timezone,
        businessId: a.owner?.id,
        businessName: a.owner?.name,
        kind,
      });
    };
    tree.personal.forEach((a) => push(a, "personal"));
    tree.businesses.forEach((b) => {
      b.owned.forEach((a) => push(a, "owned"));
      b.client.forEach((a) => push(a, "client"));
    });
    if (rows.length) tx.insert(schema.accountsCache).values(rows).run();
  });
}

export function getAccountTree(): AccountTree | null {
  const row = getDb().select().from(schema.settings).where(eq(schema.settings.key, TREE_KEY)).get();
  return (row?.value as AccountTree | undefined) ?? null;
}

/** Procura uma conta (act_123) em qualquer lugar da árvore. */
export function findAccount(tree: AccountTree | null, id: string): AccountSummary | undefined {
  if (!tree) return undefined;
  return [...tree.personal, ...tree.businesses.flatMap((b) => [...b.owned, ...b.client])].find((a) => a.id === id);
}

export function clearAccountTree() {
  const db = getDb();
  db.delete(schema.settings).where(eq(schema.settings.key, TREE_KEY)).run();
  db.delete(schema.accountsCache).run();
}
