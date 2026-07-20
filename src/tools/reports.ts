import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, requireAccount, type ToolContext } from "./types.js";
import { DEFAULT_METRICS, resolveBreakdowns, resolveMetrics } from "../metrics.js";
import { isoDaysAgo, todayIso } from "../dates.js";

export function registerReportTools(server: McpServer, ctx: ToolContext): string[] {
  server.registerTool(
    "get_performance_report",
    {
      description:
        "Performance report for an ad account. Accepts friendly lowercase metric names " +
        "(e.g. impressions, clicks, spend, ctr, cpc, conversion_page_visit_clicks) validated locally " +
        "before the call. Money metrics come back in USD. Defaults to the last 7 days.",
      inputSchema: {
        account_id: z.string().optional().describe("Ad account id. Falls back to REDDIT_ADS_ACCOUNT_ID."),
        start_date: z.string().optional().describe("YYYY-MM-DD, inclusive. Default: 7 days ago."),
        end_date: z.string().optional().describe("YYYY-MM-DD, inclusive. Default: today."),
        metrics: z.array(z.string()).optional().describe("Friendly metric names. Default: a useful spend+conversions set."),
        breakdowns: z
          .array(z.string())
          .optional()
          .describe("Dimensions to break down by, e.g. date, campaign_id, country, community."),
      },
    },
    async ({ account_id, start_date, end_date, metrics, breakdowns }) => {
      const acct = requireAccount(ctx, account_id);
      const fields = resolveMetrics(metrics ?? DEFAULT_METRICS);
      const result = await ctx.client.report(acct, {
        fields,
        breakdowns: breakdowns ? resolveBreakdowns(breakdowns) : undefined,
        startDate: start_date ?? isoDaysAgo(7),
        endDate: end_date ?? todayIso(),
      });
      return jsonResult(result);
    }
  );

  server.registerTool(
    "get_daily_performance",
    {
      description: "Day-by-day performance for the trailing N days (breakdown by date). Money metrics in USD.",
      inputSchema: {
        account_id: z.string().optional().describe("Ad account id. Falls back to REDDIT_ADS_ACCOUNT_ID."),
        days: z.number().int().positive().optional().describe("Number of trailing days. Default 7."),
      },
    },
    async ({ account_id, days }) => {
      const acct = requireAccount(ctx, account_id);
      const result = await ctx.client.report(acct, {
        fields: resolveMetrics(DEFAULT_METRICS),
        breakdowns: resolveBreakdowns(["date"]),
        startDate: isoDaysAgo(days ?? 7),
        endDate: todayIso(),
      });
      return jsonResult(result);
    }
  );

  server.registerTool(
    "compare_periods",
    {
      description:
        "Compare account performance over the trailing N days against the N days immediately before " +
        "(same-length back-to-back windows). Returns totals for both windows plus absolute and percent " +
        "change per metric. Money metrics in USD.",
      inputSchema: {
        account_id: z.string().optional().describe("Ad account id. Falls back to REDDIT_ADS_ACCOUNT_ID."),
        days: z.number().int().positive().max(90).optional().describe("Window length in trailing days. Default 7."),
        metrics: z.array(z.string()).optional().describe("Friendly metric names. Default: a useful spend+conversions set."),
      },
    },
    async ({ account_id, days, metrics }) => {
      const acct = requireAccount(ctx, account_id);
      const n = days ?? 7;
      const fields = resolveMetrics(metrics ?? DEFAULT_METRICS);
      const windows = {
        current: { start_date: isoDaysAgo(n), end_date: todayIso() },
        previous: { start_date: isoDaysAgo(2 * n + 1), end_date: isoDaysAgo(n + 1) },
      };
      const [cur, prev] = [
        await ctx.client.report(acct, { fields, startDate: windows.current.start_date, endDate: windows.current.end_date }),
        await ctx.client.report(acct, { fields, startDate: windows.previous.start_date, endDate: windows.previous.end_date }),
      ];
      const curTotals = sumRows(cur.metrics as Record<string, unknown>[]);
      const prevTotals = sumRows(prev.metrics as Record<string, unknown>[]);
      const changes: Record<string, unknown> = {};
      for (const k of new Set([...Object.keys(curTotals), ...Object.keys(prevTotals)])) {
        const c = curTotals[k] ?? 0;
        const p = prevTotals[k] ?? 0;
        changes[k] = {
          current: c,
          previous: p,
          change: Math.round((c - p) * 100) / 100,
          change_pct: p === 0 ? null : Math.round(((c - p) / p) * 1000) / 10,
        };
      }
      return jsonResult({
        current: { ...windows.current, totals: curTotals },
        previous: { ...windows.previous, totals: prevTotals },
        changes,
      });
    }
  );

  server.registerTool(
    "compare_ads",
    {
      description:
        "Per-ad performance within one ad group, joined with each ad's name and creative headline and " +
        "sorted by spend - answers 'which creative is winning?' in one call. Money metrics in USD.",
      inputSchema: {
        ad_group_id: z.string().describe("Ad group whose ads to compare."),
        account_id: z.string().optional().describe("Ad account id. Falls back to REDDIT_ADS_ACCOUNT_ID."),
        days: z.number().int().positive().max(90).optional().describe("Trailing days to report over. Default 30."),
        metrics: z.array(z.string()).optional().describe("Friendly metric names. Default: a useful spend+conversions set."),
      },
    },
    async ({ ad_group_id, account_id, days, metrics }) => {
      const acct = requireAccount(ctx, account_id);
      const fields = resolveMetrics(metrics ?? DEFAULT_METRICS);
      const period = { start_date: isoDaysAgo(days ?? 30), end_date: todayIso() };
      const ads = ((await ctx.client.listAds(acct, ad_group_id)).data as Array<Record<string, unknown>>) ?? [];
      const report = await ctx.client.report(acct, {
        fields,
        breakdowns: resolveBreakdowns(["ad_id"]),
        startDate: period.start_date,
        endDate: period.end_date,
      });
      const byAd = new Map<string, Record<string, unknown>>();
      for (const row of report.metrics as Array<Record<string, unknown>>) byAd.set(String(row.ad_id), row);
      const rows = await Promise.all(
        ads.map(async (ad) => {
          let headline: string | null = null;
          if (typeof ad.post_id === "string") {
            try {
              const post = ((await ctx.client.getPost(ad.post_id)) as { data: { headline?: string } }).data;
              headline = post.headline ?? null;
            } catch {
              headline = null; // creative unavailable; the comparison still stands
            }
          }
          const { ad_id: _adId, ...rowMetrics } = byAd.get(String(ad.id)) ?? {};
          void _adId;
          return { ad_id: ad.id, name: ad.name, configured_status: ad.configured_status, headline, ...rowMetrics };
        })
      );
      const rank = (r: Record<string, unknown>) =>
        typeof r.spend === "number" ? r.spend : typeof r.impressions === "number" ? r.impressions : 0;
      rows.sort((a, b) => rank(b) - rank(a));
      return jsonResult({ ad_group_id, period, metrics_updated_at: report.metricsUpdatedAt, ads: rows });
    }
  );

  return ["get_performance_report", "get_daily_performance", "compare_periods", "compare_ads"];
}

/** Sum every numeric field across report rows (without breakdowns each field is a metric). */
function sumRows(rows: Array<Record<string, unknown>>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows)
    for (const [k, v] of Object.entries(row)) if (typeof v === "number") totals[k] = (totals[k] ?? 0) + v;
  return totals;
}
