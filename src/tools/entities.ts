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

  server.registerTool(
    "get_ad_creative",
    {
      description:
        "Read the creative behind an ad: headline, body text, media, thumbnail, and post URL. The creative " +
        "lives on the ad's promoted post and is immutable via the API - changing copy means creating a new ad.",
      inputSchema: { ad_id: z.string().describe("Ad id.") },
    },
    async ({ ad_id }) => {
      const ad = ((await ctx.client.getAd(ad_id)) as { data: Entity }).data;
      const postId = ad.post_id as string | undefined;
      if (!postId) throw new Error(`get_ad_creative: ad ${ad_id} has no post_id (no promoted post attached yet).`);
      const post = ((await ctx.client.getPost(postId)) as { data: Entity }).data;
      return jsonResult({ ad_id, post_id: postId, creative: post });
    }
  );

  server.registerTool(
    "find_entity",
    {
      description:
        "Find campaigns, ad groups, or ads by name (case-insensitive substring match). Use this to resolve " +
        "a human-readable name to an id before calling other tools.",
      inputSchema: {
        query: z.string().describe("Name fragment to search for."),
        entity_type: z
          .enum(["campaign", "ad_group", "ad", "any"])
          .optional()
          .describe("Restrict the search to one type. Default: any."),
        account_id: z.string().optional().describe("Ad account id. Falls back to REDDIT_ADS_ACCOUNT_ID."),
      },
    },
    async ({ query, entity_type, account_id }) => {
      const acct = requireAccount(ctx, account_id);
      const q = query.toLowerCase();
      const want = (t: string) => !entity_type || entity_type === "any" || entity_type === t;
      const matches: Entity[] = [];
      const scan = (items: Entity[], type: string, parentKeys: string[]) => {
        for (const e of items) {
          if (typeof e.name !== "string" || !e.name.toLowerCase().includes(q)) continue;
          const m: Entity = {
            type,
            id: e.id,
            name: e.name,
            configured_status: e.configured_status,
            effective_status: e.effective_status,
          };
          for (const k of parentKeys) if (e[k] !== undefined) m[k] = e[k];
          matches.push(m);
        }
      };
      if (want("campaign")) scan(((await ctx.client.listCampaigns(acct)).data as Entity[]) ?? [], "campaign", []);
      if (want("ad_group"))
        scan(((await ctx.client.listAdGroups(acct)).data as Entity[]) ?? [], "ad_group", ["campaign_id"]);
      if (want("ad"))
        scan(((await ctx.client.listAds(acct)).data as Entity[]) ?? [], "ad", ["ad_group_id", "campaign_id"]);
      return jsonResult({ query, total_matches: matches.length, matches: matches.slice(0, 50) });
    }
  );

  return [
    "get_campaigns",
    "get_campaign",
    "get_ad_groups",
    "get_ad_group",
    "get_ads",
    "get_ad",
    "get_ad_creative",
    "find_entity",
  ];
}
