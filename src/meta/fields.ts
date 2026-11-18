/** Campos lidos de cada objeto da Meta (validados na Fase 0, Graph API v26.0). */

const list = (...fields: string[]) => fields.join(",");

export const ACCOUNT_FIELDS = list(
  "id", "account_id", "name", "account_status", "disable_reason", "currency",
  "timezone_name", "business{id,name}", "amount_spent", "is_prepay_account",
);

/** account_status da Meta → texto em português. */
export const ACCOUNT_STATUS: Record<number, string> = {
  1: "Ativa",
  2: "Desativada",
  3: "Pagamento pendente",
  7: "Em análise de risco",
  8: "Liquidação pendente",
  9: "Período de carência",
  100: "Fechamento pendente",
  101: "Fechada",
  201: "Ativa",
  202: "Fechada",
};

export const OAUTH_SCOPES = [
  "ads_management",
  "ads_read",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
];
