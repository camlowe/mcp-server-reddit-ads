import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, requireAccount, type ToolContext } from "./types.js";
import { resolveMetrics } from "../metrics.js";
import { isoDaysAgo, todayIso } from "../dates.js";

type Entity = Record<string, unknown>;

function countByStatus(res: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of (res as { data?: Entity[] }).data ?? []) {
    const status = String(e.effective_status ?? "UNKNOWN");
    out[status] = (out[status] ?? 0) + 1;
  }
  return out;
}

export function registerAccountTools(server: McpServer, ctx: ToolContext): string[] {
  server.registerTool(
    "get_accounts",
    {
      description: "List all Reddit ad accounts reachable by these credentials (across every business).",
      inputSchema: {},
    },
    async () => jsonResult(await ctx.client.getAccounts())
  );

  server.registerTool(
    "get_account_overview",
    {
      description:
        "One-glance health of an account: campaign/ad-group/ad counts by effective status, and this-week " +
        "vs last-week spend (two comparable 7-day windows). One entity sweep plus one report call.",
      inputSchema: {
        account_id: z.string().optional().describe("Ad account id. Falls back to REDDIT_ADS_ACCOUNT_ID."),
      },
    },
    async ({ account_id }) => {
      const acct = requireAccount(ctx, account_id);
      const [campaigns, adGroups, ads] = await Promise.all([
        ctx.client.listCampaigns(acct),
        ctx.client.listAdGroups(acct),
        ctx.client.listAds(acct),
      ]);
      const report = await ctx.client.report(acct, {
        fields: resolveMetrics(["spend"]),
        breakdowns: ["DATE"],
        startDate: isoDaysAgo(13),
        endDate: todayIso(),
      });
      const cutoff = isoDaysAgo(6); // rows on/after this date are the most recent 7 days
      let last7 = 0;
      let prior7 = 0;
      for (const row of report.metrics) {
        const date = String((row as Entity).date ?? "");
        const spend = Number((row as Entity).spend ?? 0);
        if (date >= cutoff) last7 += spend;
        else prior7 += spend;
      }
      return jsonResult({
        account_id: acct,
        counts: {
          campaigns: countByStatus(campaigns),
          ad_groups: countByStatus(adGroups),
          ads: countByStatus(ads),
        },
        spend: {
          last_7_days: { start: cutoff, end: todayIso(), spend_usd: last7 },
          prior_7_days: { start: isoDaysAgo(13), end: isoDaysAgo(7), spend_usd: prior7 },
        },
        metrics_updated_at: report.metricsUpdatedAt,
      });
    }
  );

  return ["get_accounts", "get_account_overview"];
}
