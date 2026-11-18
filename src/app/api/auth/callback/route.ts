import { cookies } from "next/headers";
import { exchangeCode, finalizeToken, redirectUri, STATE_COOKIE } from "@/meta/auth";
import { fetchAccountTree, saveAccountTree } from "@/meta/accounts";
import { friendlyError } from "@/meta/errors";
import { getAppConfig, getGraph } from "@/meta/store";

/** Volta do login da Meta: troca o código pelo token, salva criptografado e lê as contas. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (params: Record<string, string>) =>
    Response.redirect(new URL(`/conectar?${new URLSearchParams(params)}`, url), 302);

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/auth" });

  const metaError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (metaError) return back({ erro: `A Meta respondeu: ${metaError}` });

  const state = url.searchParams.get("state");
  if (!expected || state !== expected) {
    return back({ erro: "O login expirou ou veio de outra aba. Clique em Entrar com Facebook de novo." });
  }

  const code = url.searchParams.get("code");
  const app = getAppConfig();
  if (!code || !app) return back({ erro: "A Meta não devolveu o código de login." });

  try {
    const token = await exchangeCode(app, code, redirectUri(url.port || 80));
    const result = await finalizeToken(app, token);
    try {
      saveAccountTree(await fetchAccountTree(getGraph()));
    } catch (e) {
      return back({ ok: "1", aviso: `Conectado, mas não deu para ler as contas agora: ${friendlyError(e)}` });
    }
    return back(result.missingScopes.length ? { ok: "1", faltam: result.missingScopes.join(",") } : { ok: "1" });
  } catch (e) {
    return back({ erro: friendlyError(e) });
  }
}
