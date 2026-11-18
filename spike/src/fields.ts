/**
 * Campos lidos de cada objeto da Meta.
 * Pedimos "a mais" de propósito: o cliente remove sozinho os que não existem na versão
 * atual e registra quais foram — isso responde parte da Fase 0 (o que a API ainda expõe).
 */

const list = (...fields: string[]) => fields.join(",");

export const ACCOUNT_FIELDS = list(
  "id", "account_id", "name", "account_status", "disable_reason", "currency",
  "timezone_name", "timezone_offset_hours_utc", "business{id,name}", "owner",
  "amount_spent", "spend_cap", "is_prepay_account",
);

export const CAMPAIGN_FIELDS = list(
  "id", "name", "objective", "status", "configured_status", "effective_status",
  "buying_type", "bid_strategy", "daily_budget", "lifetime_budget", "spend_cap",
  "special_ad_categories", "special_ad_category_country", "smart_promotion_type",
  "advantage_state_info", "promoted_object", "is_adset_budget_sharing_enabled",
  "pacing_type", "start_time", "stop_time", "created_time", "issues_info",
);

export const ADSET_FIELDS = list(
  "id", "name", "campaign_id", "status", "configured_status", "effective_status",
  "optimization_goal", "optimization_sub_event", "billing_event", "bid_amount",
  "bid_strategy", "bid_constraints", "daily_budget", "lifetime_budget",
  "daily_min_spend_target", "daily_spend_cap", "lifetime_min_spend_target",
  "lifetime_spend_cap", "targeting", "promoted_object", "attribution_spec",
  "destination_type", "start_time", "end_time", "pacing_type", "is_dynamic_creative",
  "frequency_control_specs", "multi_optimization_goal_weight", "dsa_beneficiary",
  "dsa_payor", "existing_customer_budget_percentage", "learning_stage_info",
  "created_time", "issues_info",
);

export const CREATIVE_FIELDS = list(
  "id", "name", "status", "object_type", "object_story_id", "effective_object_story_id",
  "object_story_spec", "asset_feed_spec", "degrees_of_freedom_spec", "creative_sourcing_spec",
  "contextual_multi_ads", "url_tags", "call_to_action_type", "image_hash", "image_url",
  "video_id", "thumbnail_url", "body", "title", "link_url", "actor_id", "instagram_user_id",
  "source_instagram_media_id", "effective_instagram_media_id", "platform_customizations",
  "portrait_customizations", "ad_disclaimer_spec", "branded_content",
  "facebook_branded_content", "instagram_branded_content", "product_set_id",
  "use_page_actor_override",
);

export const AD_FIELDS = list(
  "id", "name", "adset_id", "campaign_id", "status", "configured_status", "effective_status",
  "tracking_specs", "conversion_domain", "ad_review_feedback", "issues_info", "created_time",
  `creative{${CREATIVE_FIELDS}}`,
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
  201: "Ativa (qualquer)",
  202: "Fechada (qualquer)",
};
