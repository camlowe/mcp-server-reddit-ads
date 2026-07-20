/**
 * Friendly lowercase names → Reddit report enum values.
 * The enum list comes from Reddit's 400-error dump.
 * Extend as users need more; keep names exactly lowercase-of-enum EXCEPT
 * where Reddit's own naming is inconsistent - we normalize on sign_up.
 */
export const METRICS: Record<string, string> = {
  impressions: "IMPRESSIONS",
  reach: "REACH",
  frequency: "FREQUENCY",
  clicks: "CLICKS",
  spend: "SPEND",
  ctr: "CTR",
  cpc: "CPC",
  ecpm: "ECPM",
  cpv: "CPV",
  upvotes: "UPVOTES",
  downvotes: "DOWNVOTES",
  viewable_impressions: "VIEWABLE_IMPRESSIONS",
  video_started: "VIDEO_STARTED",
  video_completion_rate: "VIDEO_COMPLETION_RATE",
  video_watched_25_percent: "VIDEO_WATCHED_25_PERCENT",
  video_watched_50_percent: "VIDEO_WATCHED_50_PERCENT",
  video_watched_75_percent: "VIDEO_WATCHED_75_PERCENT",
  video_watched_100_percent: "VIDEO_WATCHED_100_PERCENT",
  conversion_page_visit_clicks: "CONVERSION_PAGE_VISIT_CLICKS",
  conversion_page_visit_views: "CONVERSION_PAGE_VISIT_VIEWS",
  conversion_lead_clicks: "CONVERSION_LEAD_CLICKS",
  conversion_lead_views: "CONVERSION_LEAD_VIEWS",
  conversion_sign_up_clicks: "CONVERSION_SIGN_UP_CLICKS",
  conversion_sign_up_views: "CONVERSION_SIGN_UP_VIEWS",
  conversion_purchase_clicks: "CONVERSION_PURCHASE_CLICKS",
  conversion_purchase_total_value: "CONVERSION_PURCHASE_TOTAL_VALUE",
  conversion_roas: "CONVERSION_ROAS",
  key_conversion_total_count: "KEY_CONVERSION_TOTAL_COUNT",
  key_conversion_clicks: "KEY_CONVERSION_CLICKS",
  key_conversion_ecpa: "KEY_CONVERSION_ECPA",
};

export const BREAKDOWNS: Record<string, string> = {
  date: "DATE",
  hour: "HOUR",
  campaign_id: "CAMPAIGN_ID",
  ad_group_id: "AD_GROUP_ID",
  ad_id: "AD_ID",
  country: "COUNTRY",
  region: "REGION",
  dma: "DMA",
  community: "COMMUNITY",
  placement: "PLACEMENT",
  device_os: "DEVICE_OS",
  age: "AGE",
  gender: "GENDER",
  interest: "INTEREST",
  keyword: "KEYWORD",
};

export const DEFAULT_METRICS = [
  "impressions",
  "clicks",
  "spend",
  "ctr",
  "cpc",
  "conversion_page_visit_clicks",
  "key_conversion_total_count",
];

/** Report metrics whose values come back in microcurrency. */
export const MONEY_METRICS = new Set(["spend", "cpc", "ecpm", "cpv", "key_conversion_ecpa"]);

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[a.length]![b.length]!;
}

function resolve(names: string[], table: Record<string, string>, kind: string): string[] {
  return names.map((n) => {
    const hit = table[n];
    if (hit) return hit;
    const closest = Object.keys(table).sort((a, b) => levenshtein(n, a) - levenshtein(n, b))[0];
    throw new Error(
      `Unknown ${kind} '${n}' - did you mean '${closest}'? Valid ${kind}s: ${Object.keys(table).join(", ")}`
    );
  });
}

export const resolveMetrics = (names: string[]) => resolve(names, METRICS, "metric");
export const resolveBreakdowns = (names: string[]) => resolve(names, BREAKDOWNS, "breakdown");
