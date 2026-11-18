/**
 * Campos lidos para o snapshot (validados na Fase 0, Graph API v26.0).
 * Pedimos "a mais": o cliente remove sozinho os que não existirem na versão atual.
 */
const list = (...f: string[]) => f.join(",");

export const SNAP_CAMPAIGN_FIELDS = list(
  "id", "name", "objective", "status", "effective_status", "buying_type", "bid_strategy",
  "daily_budget", "lifetime_budget", "spend_cap", "special_ad_categories", "special_ad_category_country",
  "smart_promotion_type", "promoted_object", "is_adset_budget_sharing_enabled", "start_time", "stop_time",
);

export const SNAP_ADSET_FIELDS = list(
  "id", "name", "campaign_id", "status", "effective_status", "optimization_goal", "optimization_sub_event",
  "billing_event", "bid_amount", "bid_strategy", "bid_constraints", "daily_budget", "lifetime_budget",
  "daily_min_spend_target", "daily_spend_cap", "lifetime_min_spend_target", "lifetime_spend_cap",
  "targeting", "promoted_object", "attribution_spec", "destination_type", "start_time", "end_time",
  "is_dynamic_creative", "frequency_control_specs", "multi_optimization_goal_weight", "dsa_beneficiary",
  "dsa_payor", "existing_customer_budget_percentage",
);

export const SNAP_CREATIVE_FIELDS = list(
  "id", "name", "object_type", "object_story_id", "effective_object_story_id", "object_story_spec",
  "asset_feed_spec", "degrees_of_freedom_spec", "contextual_multi_ads", "url_tags", "call_to_action_type",
  "image_hash", "video_id", "thumbnail_url", "instagram_user_id", "source_instagram_media_id",
  "branded_content", "facebook_branded_content", "instagram_branded_content",
);

export const SNAP_AD_FIELDS = list(
  "id", "name", "adset_id", "campaign_id", "status", "effective_status", "tracking_specs",
  "conversion_domain", `creative{${SNAP_CREATIVE_FIELDS}}`,
);
