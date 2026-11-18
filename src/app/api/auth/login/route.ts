import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { buildLoginUrl, redirectUri, STATE_COOKIE } from "@/meta/auth";
import { getAppConfig } from "@/meta/store";

/** Inicia o "Entrar com Facebook". */
export async function GET(request: Request) {
  const url = new URL(request.url);

  // O retorno do login é sempre em "localhost". Se a pessoa abriu por 127.0.0.1, troca antes,
  // senão o cookie de segurança não volta junto e o login é recusado.
  if (url.hostname !== "localhost") {
    return Response.redirect(`http://localhost:${url.port || 80}${url.pathname}`, 302);
  }

  const app = getAppConfig();
  if (!app) return Response.redirect(new URL("/conectar?erro=app", url), 302);

  const state = randomBytes(16).toString("hex");
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });

  return Response.redirect(buildLoginUrl(app, redirectUri(url.port || 80), state), 302);
}
