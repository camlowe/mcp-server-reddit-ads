import { RedditApiError } from "./errors.js";
import { withRetry } from "./retry.js";
import { USER_AGENT } from "./auth.js";
import { microToUsd } from "./money.js";
import { MONEY_METRICS } from "./metrics.js";

const BASE = "https://ads-api.reddit.com/api/v3";
const MAX_PAGES = 50;

interface TokenSource {
  getAccessToken(): Promise<string>;
}

type Json = Record<string, unknown>;

/** Report metric keys come back lowercase; convert any that are microcurrency. */
function convertReportRow(row: Json): Json {
  const out: Json = { ...row };
  for (const k of Object.keys(out)) {
    if (MONEY_METRICS.has(k)) out[k] = microToUsd(out[k] as number | null | undefined);
  }
  return out;
}

/**
 * Reddit returns 404 for wrong HTTP verbs as well as wrong paths (verified
 * against the live API 2026-07-20). We keep the set of route shapes we know are
 * valid; a 404 on one of these means the RESOURCE is missing. A 404 anywhere
 * else means we (or Reddit) changed shape and the error says so.
 */
const KNOWN_ROUTES: Array<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^\/me\/businesses$/ },
  { method: "GET", pattern: /^\/businesses\/[^/]+\/ad_accounts$/ },
  { method: "GET", pattern: /^\/ad_accounts\/[^/]+\/(campaigns|ad_groups|ads)$/ },
  { method: "GET", pattern: /^\/(campaigns|ad_groups|ads)\/[^/]+$/ },
  { method: "PATCH", pattern: /^\/(campaigns|ad_groups|ads)\/[^/]+$/ },
  { method: "POST", pattern: /^\/ad_accounts\/[^/]+\/(campaigns|ad_groups|ads|reports)$/ },
  { method: "GET", pattern: /^\/targeting\/(subreddits|interests|geos)$/ },
];

function isKnownRoute(method: string, path: string): boolean {
  return KNOWN_ROUTES.some((r) => r.method === method && r.pattern.test(path));
}

/** Path used for route classification: strip the base URL (paged follow-ups are absolute) and the query. */
function classificationPath(path: string): string {
  const withoutBase = path.startsWith("https://") ? path.replace(/^https:\/\/[^/]+\/api\/v3/, "") : path;
  return withoutBase.split("?")[0]!;
}

/** Pull the useful part out of Reddit's field-validation 400s without the ~400-entry enum dump. */
function summarizeApiError(body: string): string {
  try {
    const parsed = JSON.parse(body) as Json;
    const err = parsed.error as Json | undefined;
    const fields = err?.fields as Array<{ field: string; message: string }> | undefined;
    if (fields?.length) {
      return fields
        .map((f) => {
          const quoted = f.message.match(/^'([^']+)' is not one of/);
          return quoted ? `${f.field}: '${quoted[1]}' is not a valid value` : `${f.field}: ${f.message.slice(0, 200)}`;
        })
        .join("; ");
    }
    if (typeof err?.message === "string") return err.message;
  } catch {
    /* not JSON */
  }
  return body.slice(0, 300);
}

export interface ReportOptions {
  fields: string[];
  breakdowns?: string[];
  startDate: string;
  endDate: string;
}

export interface ReportResult {
  metrics: Json[];
  metricsUpdatedAt: unknown;
  truncated: boolean;
}

export interface ListResult {
  data: unknown[];
  truncated: boolean;
}

export class RedditAdsClient {
  constructor(
    private readonly tokens: TokenSource,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly retryOpts: { attempts?: number; baseMs?: number } = {}
  ) {}

  private async request<T = Json>(
    method: string,
    path: string,
    opts: { params?: Record<string, string>; body?: unknown } = {}
  ): Promise<T> {
    return withRetry(async () => {
      const token = await this.tokens.getAccessToken();
      const isAbsolute = path.startsWith("https://");
      let url = isAbsolute ? path : BASE + path;
      if (!isAbsolute && opts.params && Object.keys(opts.params).length > 0) {
        url += "?" + new URLSearchParams(opts.params).toString();
      }
      const resp = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) {
        const text = await resp.text();
        const routePath = classificationPath(path);
        if (resp.status === 404) {
          const msg = isKnownRoute(method, routePath)
            ? `Reddit resource not found: ${method} ${routePath}. Check the ID - note that Reddit also returns 404 (not 405) for unsupported HTTP methods.`
            : `Unexpected 404 for ${method} ${routePath} - this route shape is not in the verified table; the API may have changed.`;
          throw new RedditApiError(msg, 404, method, routePath, text);
        }
        throw new RedditApiError(
          `Reddit API error ${resp.status} on ${method} ${routePath}: ${summarizeApiError(text)}`,
          resp.status,
          method,
          routePath,
          text
        );
      }
      return (await resp.json()) as T;
    }, this.retryOpts);
  }

  /**
   * Fetch the first page, then follow `pagination.next_url` (an absolute URL)
   * until exhausted, concatenating what `extract` pulls from each page.
   * Caps at MAX_PAGES and never silently drops data (see truncated flag + log).
   */
  private async collectPages(
    method: string,
    path: string,
    opts: { params?: Record<string, string>; body?: unknown },
    extract: (page: Json) => unknown[]
  ): Promise<{ items: unknown[]; firstPage: Json; truncated: boolean }> {
    const items: unknown[] = [];
    let page = await this.request<Json>(method, path, opts);
    const firstPage = page;
    items.push(...extract(page));
    let count = 1;
    let truncated = false;
    for (;;) {
      const pagination = page.pagination as Json | undefined;
      const next = pagination?.next_url as string | null | undefined;
      if (!next) break;
      if (count >= MAX_PAGES) {
        console.error(
          `[client] Pagination cap of ${MAX_PAGES} pages hit for ${classificationPath(path)}; results are truncated.`
        );
        truncated = true;
        break;
      }
      page = await this.request<Json>("GET", next, {});
      items.push(...extract(page));
      count++;
    }
    return { items, firstPage, truncated };
  }

  // ── Accounts ────────────────────────────────────────────────────────
  async getAccounts(): Promise<Json[]> {
    const biz = await this.request<Json>("GET", "/me/businesses");
    const businesses = (biz.data as Json[] | undefined) ?? [];
    const accounts: Json[] = [];
    for (const b of businesses) {
      const res = await this.request<Json>("GET", `/businesses/${b.id}/ad_accounts`);
      accounts.push(...((res.data as Json[] | undefined) ?? []));
    }
    return accounts;
  }

  // ── Entities: list (paged) ──────────────────────────────────────────
  private async listScoped(accountId: string, kind: string, params: Record<string, string>): Promise<ListResult> {
    const { items, truncated } = await this.collectPages(
      "GET",
      `/ad_accounts/${accountId}/${kind}`,
      { params },
      (p) => (p.data as unknown[] | undefined) ?? []
    );
    return { data: items, truncated };
  }

  listCampaigns(accountId: string): Promise<ListResult> {
    return this.listScoped(accountId, "campaigns", {});
  }
  listAdGroups(accountId: string, campaignId?: string): Promise<ListResult> {
    return this.listScoped(accountId, "ad_groups", campaignId ? { campaign_id: campaignId } : {});
  }
  listAds(accountId: string, adGroupId?: string): Promise<ListResult> {
    return this.listScoped(accountId, "ads", adGroupId ? { ad_group_id: adGroupId } : {});
  }

  // ── Entities: single (bare path) ────────────────────────────────────
  getCampaign(campaignId: string) {
    return this.request("GET", `/campaigns/${campaignId}`);
  }
  getAdGroup(adGroupId: string) {
    return this.request("GET", `/ad_groups/${adGroupId}`);
  }
  getAd(adId: string) {
    return this.request("GET", `/ads/${adId}`);
  }

  // ── Create (account-scoped, born PAUSED unless overridden) ──────────
  createCampaign(accountId: string, data: Json) {
    return this.request("POST", `/ad_accounts/${accountId}/campaigns`, {
      body: { data: { configured_status: "PAUSED", ...data } },
    });
  }
  createAdGroup(accountId: string, data: Json) {
    return this.request("POST", `/ad_accounts/${accountId}/ad_groups`, {
      body: { data: { configured_status: "PAUSED", ...data } },
    });
  }
  createAd(accountId: string, data: Json) {
    return this.request("POST", `/ad_accounts/${accountId}/ads`, {
      body: { data: { configured_status: "PAUSED", ...data } },
    });
  }

  // ── Update (bare path, PATCH) ───────────────────────────────────────
  patchCampaign(campaignId: string, patch: Json) {
    return this.request("PATCH", `/campaigns/${campaignId}`, { body: { data: patch } });
  }
  patchAdGroup(adGroupId: string, patch: Json) {
    return this.request("PATCH", `/ad_groups/${adGroupId}`, { body: { data: patch } });
  }
  patchAd(adId: string, patch: Json) {
    return this.request("PATCH", `/ads/${adId}`, { body: { data: patch } });
  }

  // ── Reporting ───────────────────────────────────────────────────────
  async report(accountId: string, o: ReportOptions): Promise<ReportResult> {
    const toIso = (d: string) => (d.includes("T") ? d : `${d}T00:00:00Z`);
    const data: Json = { starts_at: toIso(o.startDate), ends_at: toIso(o.endDate), fields: o.fields };
    if (o.breakdowns) data.breakdowns = o.breakdowns;
    const { items, firstPage, truncated } = await this.collectPages(
      "POST",
      `/ad_accounts/${accountId}/reports`,
      { body: { data } },
      (p) => ((p.data as Json | undefined)?.metrics as unknown[] | undefined) ?? []
    );
    const metrics = (items as Json[]).map(convertReportRow);
    const metricsUpdatedAt = (firstPage.data as Json | undefined)?.metrics_updated_at;
    return { metrics, metricsUpdatedAt, truncated };
  }

  // ── Targeting ───────────────────────────────────────────────────────
  searchSubreddits(query: string) {
    return this.request("GET", "/targeting/subreddits", { params: { query } });
  }
  getInterests() {
    return this.request("GET", "/targeting/interests");
  }
  searchGeos(query?: string) {
    return this.request("GET", "/targeting/geos", { params: query ? { query } : {} });
  }
}
