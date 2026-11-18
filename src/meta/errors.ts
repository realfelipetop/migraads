import { GraphError } from "./graph";

/** Erros da Meta → mensagens em português claro (PLANO §8.4). */
export function friendlyError(e: unknown): string {
  if (!(e instanceof GraphError)) return e instanceof Error ? e.message : String(e);

  if (e.status === 0) return "Sem conexão com a Meta. Confira sua internet e tente de novo.";
  if (e.code === 190) {
    if (e.subcode === 463 || /expired/i.test(e.message)) return "Sua conexão com a Meta expirou. Clique em Reconectar.";
    return "A Meta não aceitou este acesso (token inválido ou revogado). Conecte de novo.";
  }
  if (e.code === 101 || /client secret|client_id|app_id/i.test(e.message)) {
    return "O ID do app ou a chave secreta não conferem. Copie de novo em Configurações do app → Básico. Atenção: não confunda com o “Token do cliente” (fica em Avançado).";
  }
  if (e.code === 100 && /redirect_uri/i.test(e.message)) {
    return "O endereço de retorno do login não está cadastrado no seu app da Meta. Cadastre http://localhost:3000/api/auth/callback no Login do Facebook.";
  }
  if (e.code === 100 && /verification code/i.test(e.message)) {
    return "O código de login expirou ou já foi usado. Clique em Entrar com Facebook de novo.";
  }
  if (e.code === 10 || e.code === 200 || e.code === 803) {
    return `Falta permissão para isso na Meta. ${e.userMessage ?? e.message}`;
  }
  if ([4, 17, 32, 613, 80004].includes(e.code ?? -1)) {
    return "A Meta pediu para irmos mais devagar (limite de chamadas). Espere alguns minutos e tente de novo.";
  }
  return e.userMessage ? `${e.userTitle ? `${e.userTitle}: ` : ""}${e.userMessage}` : e.message;
}
