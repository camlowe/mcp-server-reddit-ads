import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, requireAccount, type ToolContext } from "./types.js";
import { assertAllowed } from "../gate.js";
import { usdToMicro } from "../money.js";

const PIXEL_HELP =
  "Find the conversion pixel id in the Reddit Ads dashboard under Events Manager; in practice it equals the ad account id.";

export function registerCreateTools(server: McpServer, ctx: ToolContext): string[] {
  server.registerTool(
    "create_campaign",
    {
      description:
        "Create a campaign. Always created PAUSED. If campaign budget optimization is on, a conversion " +
        `pixel id is required (Reddit mandate since 2026-07-13). ${PIXEL_HELP}`,
      inputSchema: {
        account_id: z.string().optional().describe("Ad account id. Falls back to REDDIT_ADS_ACCOUNT_ID."),
        name: z.string().describe("Campaign name."),
        objective: z.string().describe("Campaign objective, e.g. CONVERSIONS, CLICKS, IMPRESSIONS."),
        is_campaign_budget_optimization: z.boolean().optional().describe("Enable CBO (requires conversion_pixel_id)."),
        conversion_pixel_id: z.string().optional().describe("Conversion pixel id. Required when CBO is on."),
        spend_cap_usd: z.number().positive().optional().describe("Lifetime spend cap in USD."),
      },
    },
    async ({ account_id, name, objective, is_campaign_budget_optimization, conversion_pixel_id, spend_cap_usd }) => {
      assertAllowed("safe", ctx.config.writeTier);
      const acct = requireAccount(ctx, account_id);
      if (is_campaign_budget_optimization && !conversion_pixel_id) {
        throw new Error(
          `create_campaign: conversion_pixel_id is required when is_campaign_budget_optimization is true. ${PIXEL_HELP}`
        );
      }
      const body: Record<string, unknown> = { name, objective };
      if (is_campaign_budget_optimization !== undefined)
        body.is_campaign_budget_optimization = is_campaign_budget_optimization;
      if (conversion_pixel_id) body.conversion_pixel_id = conversion_pixel_id;
      if (spend_cap_usd !== undefined) body.spend_cap = usdToMicro(spend_cap_usd);
      return jsonResult(await ctx.client.createCampaign(acct, body));
    }
  );

  server.registerTool(
    "create_ad_group",
    {
      description:
        "Create an ad group. Always created PAUSED. A conversion pixel id is required (Reddit mandate since " +
        `2026-07-13). ${PIXEL_HELP}`,
      inputSchema: {
        account_id: z.string().optional().describe("Ad account id. Falls back to REDDIT_ADS_ACCOUNT_ID."),
        campaign_id: z.string().describe("Parent campaign id."),
        name: z.string().describe("Ad group name."),
        conversion_pixel_id: z.string().describe("Conversion pixel id (required)."),
        daily_budget_usd: z.number().positive().describe("Daily spend budget in USD."),
        bid_strategy: z.string().optional().describe("Bid type, e.g. MANUAL_BIDDING, MAXIMIZE_VOLUME, BIDLESS."),
        bid_usd: z.number().positive().optional().describe("Bid value in USD (for manual/capped strategies)."),
        optimization_goal: z.string().optional().describe("Optimization goal, e.g. LEAD, PAGE_VISIT, CLICKS."),
        targeting: z.record(z.unknown()).optional().describe("Targeting object (geos, communities, devices, etc.)."),
      },
    },
    async ({ account_id, campaign_id, name, conversion_pixel_id, daily_budget_usd, bid_strategy, bid_usd, optimization_goal, targeting }) => {
      assertAllowed("safe", ctx.config.writeTier);
      const acct = requireAccount(ctx, account_id);
      const body: Record<string, unknown> = {
        campaign_id,
        name,
        conversion_pixel_id,
        goal_type: "DAILY_SPEND",
        goal_value: usdToMicro(daily_budget_usd),
      };
      if (bid_strategy) body.bid_type = bid_strategy;
      if (bid_usd !== undefined) body.bid_value = usdToMicro(bid_usd);
      if (optimization_goal) body.optimization_goal = optimization_goal;
      if (targeting) body.targeting = targeting;
      return jsonResult(await ctx.client.createAdGroup(acct, body));
    }
  );

  server.registerTool(
    "create_ad",
    {
      description:
        "Create an ad. Always created PAUSED. Either promote an existing post (post_url) or build a link ad " +
        "(headline + click_url, optionally creative_type/thumbnail_url).",
      inputSchema: {
        account_id: z.string().optional().describe("Ad account id. Falls back to REDDIT_ADS_ACCOUNT_ID."),
        ad_group_id: z.string().describe("Parent ad group id."),
        name: z.string().describe("Ad name."),
        post_url: z.string().optional().describe("Existing Reddit post URL to promote."),
        headline: z.string().optional().describe("Headline for a link ad."),
        click_url: z.string().optional().describe("Landing URL for a link ad."),
        creative_type: z.string().optional().describe("Creative type for a link ad."),
        thumbnail_url: z.string().optional().describe("Thumbnail image URL for a link ad."),
        call_to_action: z.string().optional().describe("Call to action, e.g. SIGN_UP, LEARN_MORE."),
      },
    },
    async ({ account_id, ad_group_id, name, post_url, headline, click_url, creative_type, thumbnail_url, call_to_action }) => {
      assertAllowed("safe", ctx.config.writeTier);
      const acct = requireAccount(ctx, account_id);
      if (!post_url && !(headline && click_url)) {
        throw new Error(
          "create_ad: provide either post_url (to promote an existing post) or both headline and click_url (a link ad)."
        );
      }
      const body: Record<string, unknown> = { ad_group_id, name };
      if (post_url) body.post_url = post_url;
      if (headline) body.headline = headline;
      if (click_url) body.click_url = click_url;
      if (creative_type) body.creative_type = creative_type;
      if (thumbnail_url) body.thumbnail_url = thumbnail_url;
      if (call_to_action) body.call_to_action = call_to_action;
      return jsonResult(await ctx.client.createAd(acct, body));
    }
  );

  return ["create_campaign", "create_ad_group", "create_ad"];
}
