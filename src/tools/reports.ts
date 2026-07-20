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

  return ["get_performance_report", "get_daily_performance"];
}
