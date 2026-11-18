import { findAccount, getAccountTree } from "@/meta/accounts";
import { getItems, getMigration } from "@/meta/migrations";
import { migrationCsv } from "@/migration/report";

/** Baixa o relatório da migração em CSV. */
export async function GET(_request: Request, ctx: RouteContext<"/api/migrations/[id]/report">) {
  const { id } = await ctx.params;
  const m = getMigration(id);
  if (!m) return new Response("Migração não encontrada", { status: 404 });
  const tree = getAccountTree();
  const csv = migrationCsv(m, getItems(id), {
    source: findAccount(tree, m.sourceAccountId)?.name,
    dest: m.destAccountId ? findAccount(tree, m.destAccountId)?.name : undefined,
  });
  const date = (m.finishedAt ?? m.createdAt).slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="migra-ads-relatorio-${date}-${id.slice(0, 8)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
