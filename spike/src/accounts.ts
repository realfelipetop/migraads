/**
 * Lista tudo que o token enxerga, no formato do seletor de contas do Gerenciador:
 * contas pessoais, BMs (próprias e de clientes/compartilhadas).
 *
 * Uso: npm run accounts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, DATA_DIR, ensureDir, fail } from "./env.js";
import { Graph, GraphError } from "./graph.js";
import { ACCOUNT_FIELDS, ACCOUNT_STATUS } from "./fields.js";

const cfg = loadConfig({ requireToken: true });
const graph = new Graph({ ...cfg, accessToken: cfg.accessToken! });

interface Account {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  business?: { id: string; name: string };
}

const fmt = (a: Account) => {
  const status = ACCOUNT_STATUS[a.account_status] ?? `status ${a.account_status}`;
  const icon = a.account_status === 1 ? "●" : "○";
  return `${icon} ${a.name}  ·  ${a.account_id}  ·  ${status}  ·  ${a.currency} · ${a.timezone_name}`;
};

try {
  const me = await graph.get<{ id: string; name: string }>("me", { fields: "id,name" });
  console.log(`\n👤 ${me.name} (${me.id}) · Graph API ${graph.version}\n`);

  const all = await graph.getAll<Account>("me/adaccounts", { fields: ACCOUNT_FIELDS }, "AdAccount");
  const personal = all.filter((a) => !a.business);

  console.log(`A TUA CONTA — contas pessoais (${personal.length})`);
  for (const a of personal) console.log(`   ${fmt(a)}`);

  const businesses = await graph.getAll<{ id: string; name: string }>("me/businesses", { fields: "id,name" }, "Business");
  const report: any[] = [];

  console.log(`\nPORTFÓLIOS DE NEGÓCIOS (${businesses.length})`);
  for (const bm of businesses) {
    console.log(`\n🏢 ${bm.name} (${bm.id})`);
    const owned = await safeList(`${bm.id}/owned_ad_accounts`);
    const client = await safeList(`${bm.id}/client_ad_accounts`);
    console.log(`   Próprias (${owned.length})`);
    for (const a of owned) console.log(`     ${fmt(a)}`);
    if (client.length) {
      console.log(`   Compartilhadas com esta BM (${client.length})`);
      for (const a of client) console.log(`     ${fmt(a)}${a.business ? `  · dona: ${a.business.name}` : ""}`);
    }
    report.push({ ...bm, owned_ad_accounts: owned, client_ad_accounts: client });
  }

  console.log(`\nTotal de contas acessíveis pelo token: ${all.length}`);

  const file = join(ensureDir(DATA_DIR), "accounts.json");
  writeFileSync(file, JSON.stringify({ me, ad_accounts: all, businesses: report }, null, 2));
  console.log(`Salvo em ${file}`);
  printStripped();
  console.log("\nPróximo passo: npm run read -- --account <ID da conta>\n");
} catch (e) {
  fail(e instanceof GraphError ? e.describe() : (e as Error).message);
}

async function safeList(path: string): Promise<Account[]> {
  try {
    return await graph.getAll<Account>(path, { fields: ACCOUNT_FIELDS }, "AdAccount");
  } catch (e) {
    console.log(`   (sem acesso a ${path.split("/")[1]}: ${e instanceof GraphError ? e.message : e})`);
    return [];
  }
}

function printStripped() {
  if (!graph.strippedFields.size) return;
  console.log("\nCampos que não existem nesta versão da API (removidos automaticamente):");
  for (const [node, fields] of graph.strippedFields) console.log(`  ${node}: ${[...fields].join(", ")}`);
}
