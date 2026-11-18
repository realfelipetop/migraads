"use server";

import { refresh } from "next/cache";
import { finalizeToken, validateApp } from "@/meta/auth";
import { clearAccountTree, fetchAccountTree, saveAccountTree } from "@/meta/accounts";
import { friendlyError } from "@/meta/errors";
import { deleteConnection, getAppConfig, getGraph, saveAppConfig } from "@/meta/store";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";

export interface ActionState {
  ok?: boolean;
  message?: string;
}

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

/** Passo 3 do assistente: salva ID + chave secreta depois de conferir com a Meta. */
export async function saveAppAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const appId = text(fd, "appId").replace(/\D/g, "");
  let appSecret = text(fd, "appSecret");
  const loginConfigId = text(fd, "loginConfigId").replace(/\D/g, "");

  if (!appId) return { message: "Cole o ID do app (só números)." };
  const current = getAppConfig();
  if (!appSecret && current?.appId === appId) appSecret = current.appSecret; // editar só o config ID
  if (!appSecret) return { message: "Cole a chave secreta do app." };
  if (!/^[0-9a-f]{32}$/i.test(appSecret)) {
    return { message: "A chave secreta tem 32 letras e números (0-9, a-f). Confira se copiou inteira, sem espaços." };
  }

  try {
    const appName = await validateApp(appId, appSecret);
    saveAppConfig({ appId, appSecret, loginConfigId: loginConfigId || undefined, appName });
    refresh();
    return { ok: true, message: `App “${appName}” conferido com a Meta.` };
  } catch (e) {
    return { message: friendlyError(e) };
  }
}

/** Modo avançado: colar um token (Graph API Explorer ou usuário do sistema). */
export async function pasteTokenAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const token = text(fd, "token").replace(/\s+/g, "");
  const app = getAppConfig();
  if (!app) return { message: "Configure o app da Meta primeiro." };
  if (token.length < 50) return { message: "Isso não parece um token da Meta. Ele é longo e costuma começar com EAA." };
  try {
    const r = await finalizeToken(app, token);
    saveAccountTree(await fetchAccountTree(getGraph()));
    refresh();
    return {
      ok: true,
      message: r.missingScopes.length
        ? `Conectado como ${r.userName}, mas faltam permissões: ${r.missingScopes.join(", ")}.`
        : `Conectado como ${r.userName}.`,
    };
  } catch (e) {
    return { message: friendlyError(e) };
  }
}

export async function refreshAccountsAction(): Promise<ActionState> {
  try {
    const tree = await fetchAccountTree(getGraph());
    saveAccountTree(tree);
    refresh();
    return { ok: true, message: `${tree.total} contas atualizadas.` };
  } catch (e) {
    return { message: friendlyError(e) };
  }
}

export async function disconnectAction(): Promise<void> {
  deleteConnection();
  clearAccountTree();
  refresh();
}

/** Trocar de app: apaga o app configurado e a conexão. */
export async function resetAppAction(): Promise<void> {
  deleteConnection();
  clearAccountTree();
  getDb().delete(schema.settings).where(eq(schema.settings.key, "meta_app")).run();
  refresh();
}
