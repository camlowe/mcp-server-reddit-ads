import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, requireAccount, type ToolContext } from "./types.js";
import { withUsdFields } from "../money.js";

type Entity = Record<string, unknown>;

const single = (res: unknown) => withUsdFields((res as { data: Entity }).data);
const many = (res: unknown) => ((res as { data: Entity[] }).data ?? []).map(withUsdFields);

const STATUS = z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]);
const statusDesc = "Client-side filter on configured_status.";
const byStatus = (items: Entity[], status?: string) =>
  status ? items.filter((e) => e.configured_status === status) : items;

export function registerEntityTools(server: McpServer, ctx: ToolContext): string[] {
  server.registerTool(
    "get_campaigns",
    {
      description:
        "List all campaigns in a Reddit ad account, with budget fields converted to USD (*_usd siblings).",
      inputSchema: {
        account_id: z.string().optional().describe("Ad account id (a2_...). Falls back to REDDIT_ADS_ACCOUNT_ID."),
        status: STATUS.optional().describe(statusDesc),
      },
    },
    async ({ account_id, status }) =>
      jsonResult(byStatus(many(await ctx.client.listCampaigns(requireAccount(ctx, account_id))), status))
  );

  server.registerTool(
    "get_campaign",
    {
      description: "Get a single campaign by id (budget fields converted to USD).",
      inputSchema: { campaign_id: z.string().describe("Campaign id.") },
    },
    async ({ campaign_id }) => jsonResult(single(await ctx.client.getCampaign(campaign_id)))
  );

  server.registerTool(
    "get_ad_groups",
    {
      description: "List ad groups in an account, optionally filtered to one campaign. Budget/bid fields in USD.",
      inputSchema: {
        account_id: z.string().optional().describe("Ad account id. Falls back to REDDIT_ADS_ACCOUNT_ID."),
        campaign_id: z.string().optional().describe("Only return ad groups in this campaign."),
        status: STATUS.optional().describe(statusDesc),
      },
    },
    async ({ account_id, campaign_id, status }) =>
      jsonResult(byStatus(many(await ctx.client.listAdGroups(requireAccount(ctx, account_id), campaign_id)), status))
  );

  server.registerTool(
    "get_ad_group",
    {
      description: "Get a single ad group by id (budget/bid fields converted to USD).",
      inputSchema: { ad_group_id: z.string().describe("Ad group id.") },
    },
    async ({ ad_group_id }) => jsonResult(single(await ctx.client.getAdGroup(ad_group_id)))
  );

  server.registerTool(
    "get_ads",
    {
      description: "List ads in an account, optionally filtered to one ad group.",
      inputSchema: {
        account_id: z.string().optional().describe("Ad account id. Falls back to REDDIT_ADS_ACCOUNT_ID."),
        ad_group_id: z.string().optional().describe("Only return ads in this ad group."),
        status: STATUS.optional().describe(statusDesc),
      },
    },
    async ({ account_id, ad_group_id, status }) =>
      jsonResult(byStatus(many(await ctx.client.listAds(requireAccount(ctx, account_id), ad_group_id)), status))
  );

  server.registerTool(
    "get_ad",
    {
      description: "Get a single ad by id.",
      inputSchema: { ad_id: z.string().describe("Ad id.") },
    },
    async ({ ad_id }) => jsonResult(single(await ctx.client.getAd(ad_id)))
  );

  return ["get_campaigns", "get_campaign", "get_ad_groups", "get_ad_group", "get_ads", "get_ad"];
}
