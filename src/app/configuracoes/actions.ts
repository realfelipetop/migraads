"use server";

import { refresh } from "next/cache";
import { fetchSummary, getUtmifyConfig, removeUtmifyConfig, saveUtmifyConfig, UtmifyError } from "@/integrations/utmify";

export interface UtmifyState {
  ok?: boolean;
  message?: string;
}

/** Salva a chave da API oficial da Utmify depois de testar com uma consulta real (só leitura). */
export async function saveUtmifyAction(_prev: UtmifyState, fd: FormData): Promise<UtmifyState> {
  const dashboardId = String(fd.get("dashboardId") ?? "").trim();
  let apiKey = String(fd.get("apiKey") ?? "").trim();
  const current = getUtmifyConfig();
  if (!apiKey && current) apiKey = current.apiKey;
  if (!/^[a-zA-Z0-9]{6,64}$/.test(dashboardId)) return { message: "Cole o ID do dashboard (letras e números, como aparece no endereço do dashboard na Utmify)." };
  if (!apiKey) return { message: "Cole a chave da API oficial (Utmify → Avançado → API Oficial → Novo Token)." };
  try {
    const s = await fetchSummary({ apiKey, dashboardId }, {});
    saveUtmifyConfig({ apiKey, dashboardId });
    refresh();
    return { ok: true, message: `Utmify conectada (dashboard em ${s.currency}).` };
  } catch (e) {
    return { message: e instanceof UtmifyError ? e.message : "Não deu para falar com a Utmify." };
  }
}

export async function removeUtmifyAction() {
  removeUtmifyConfig();
  refresh();
}
