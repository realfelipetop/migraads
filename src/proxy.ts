import { NextResponse, type NextRequest } from "next/server";

/**
 * Proteção contra DNS rebinding (achado da revisão de segurança).
 *
 * O servidor só escuta em 127.0.0.1, mas um site malicioso aberto no navegador pode apontar o
 * próprio domínio para 127.0.0.1 e falar com o Migra Ads como se fosse ele. Nesse caso o
 * cabeçalho Host traz o domínio do atacante. Só aceitamos Host local.
 */
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function hostAllowed(host: string | null): boolean {
  if (!host) return false;
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return ALLOWED_HOSTS.has(name.toLowerCase());
}

export function proxy(request: NextRequest) {
  if (!hostAllowed(request.headers.get("host"))) {
    return new NextResponse("Acesso bloqueado: o Migra Ads só aceita conexões de localhost.", { status: 403 });
  }
  return NextResponse.next();
}
