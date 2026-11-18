"use server";

import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { loadStructure } from "@/meta/explorer";
import { friendlyError } from "@/meta/errors";
import { getGraph } from "@/meta/store";
import { countSelection, resolveSelection, type Selection } from "@/lib/selection";

export interface DraftState {
  message?: string;
}

const isId = (x: unknown): x is string => typeof x === "string" && /^\d+$/.test(x);

/**
 * Salva a seleção como rascunho de migração. A árvore é resolvida AQUI, no servidor,
 * relendo a estrutura das campanhas na Meta (não confia em nomes/contagens vindos do navegador).
 */
export async function saveDraftAction(account: string, selection: Selection, campaignIds: string[]): Promise<DraftState> {
  if (!/^act_\d+$/.test(account)) return { message: "Conta inválida." };
  const sel: Selection = {
    campaigns: selection.campaigns.filter(isId),
    adsets: selection.adsets.filter(isId),
    ads: selection.ads.filter(isId),
    excluded: selection.excluded.filter(isId),
  };
  const ids = [...new Set(campaignIds.filter(isId))];
  if (!ids.length) return { message: "Selecione pelo menos uma campanha, conjunto ou anúncio." };
  if (ids.length > 50) return { message: "Selecione no máximo 50 campanhas por migração." };

  let id: string;
  try {
    const graph = getGraph();
    const structures = [];
    for (const c of ids) {
      const s = await loadStructure(graph, c);
      // Não confia no navegador: a campanha tem que ser da conta de origem escolhida.
      if (s.campaign.accountId && `act_${s.campaign.accountId}` !== account) {
        return { message: `A campanha “${s.campaign.name}” não é da conta de origem escolhida.` };
      }
      structures.push(s);
    }
    const resolved = resolveSelection(sel, structures);
    const counts = countSelection(resolved);
    if (!counts.ads && !counts.adsets) return { message: "Nada selecionado para migrar." };

    const row = getDb()
      .insert(schema.migrations)
      .values({
        status: "draft",
        sourceAccountId: account,
        options: { selection: sel },
        summary: { resolved, counts },
      })
      .returning({ id: schema.migrations.id })
      .get();
    id = row.id;
  } catch (e) {
    return { message: friendlyError(e) };
  }
  redirect(`/migracoes/${id}`);
}
