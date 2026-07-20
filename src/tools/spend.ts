import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, type ToolContext } from "./types.js";
import { assertAllowed } from "../gate.js";
import { microToUsd, usdToMicro } from "../money.js";
import { bulkPatch } from "./patch-helpers.js";

const ITEM_TYPE = z.enum(["campaign", "ad_group", "ad"]);

/** Input key → targeting object key. `locations` is Reddit's placement targeting. */
const TARGETING_KEYS: Record<string, string> = {
  geolocations: "geolocations",
  communities: "communities",
  interests: "interests",
  devices: "devices",
  locations: "placements",
};

export function registerSpendTools(server: McpServer, ctx: ToolContext): string[] {
  server.registerTool(
    "enable_items",
    {
      description:
        "Resume delivery on one or more entities of a single type (set configured_status ACTIVE). This " +
        "restarts spend. One bad id does not abort the rest; each result reports the read-back configured_status.",
      inputSchema: {
        item_type: ITEM_TYPE.describe("Type of every id in item_ids."),
        item_ids: z.array(z.string()).min(1).describe("Ids to enable (all of item_type)."),
      },
    },
    async ({ item_type, item_ids }) => {
      assertAllowed("spend", ctx.config.writeTier);
      const results = await bulkPatch(ctx.client, item_type, item_ids, { configured_status: "ACTIVE" });
      return jsonResult({
        action: "enable",
        item_type,
        note: "Delivery resumes and spend restarts. effective_status can lag by a few minutes.",
        results,
      });
    }
  );

  server.registerTool(
    "update_budget",
    {
      description: "Set an ad group's daily spend budget (USD). Echoes the previous and new value.",
      inputSchema: {
        ad_group_id: z.string().describe("Ad group id."),
        daily_budget_usd: z.number().positive().describe("New daily budget in USD."),
      },
    },
    async ({ ad_group_id, daily_budget_usd }) => {
      assertAllowed("spend", ctx.config.writeTier);
      const current = ((await ctx.client.getAdGroup(ad_group_id)) as { data: { goal_value?: number } }).data;
      const result = await ctx.client.patchAdGroup(ad_group_id, {
        goal_type: "DAILY_SPEND",
        goal_value: usdToMicro(daily_budget_usd),
      });
      return jsonResult({
        ad_group_id,
        old_daily_budget_usd: microToUsd(current.goal_value ?? null),
        new_daily_budget_usd: daily_budget_usd,
        result,
      });
    }
  );

  server.registerTool(
    "update_bid",
    {
      description: "Set an ad group's bid value (USD). Echoes the previous and new value.",
      inputSchema: {
        ad_group_id: z.string().describe("Ad group id."),
        bid_usd: z.number().positive().describe("New bid value in USD."),
      },
    },
    async ({ ad_group_id, bid_usd }) => {
      assertAllowed("spend", ctx.config.writeTier);
      const current = ((await ctx.client.getAdGroup(ad_group_id)) as { data: { bid_value?: number } }).data;
      const result = await ctx.client.patchAdGroup(ad_group_id, { bid_value: usdToMicro(bid_usd) });
      return jsonResult({
        ad_group_id,
        old_bid_usd: microToUsd(current.bid_value ?? null),
        new_bid_usd: bid_usd,
        result,
      });
    }
  );

  server.registerTool(
    "update_targeting",
    {
      description:
        "Update an ad group's targeting. Only the fields you pass are changed; every other targeting key " +
        "(including exclusions) is preserved. Echoes a from/to diff of the changed keys.",
      inputSchema: {
        ad_group_id: z.string().describe("Ad group id."),
        geolocations: z.array(z.string()).optional().describe("Geo target ids."),
        communities: z.array(z.string()).optional().describe("Subreddit/community targets."),
        interests: z.array(z.string()).optional().describe("Interest category targets."),
        devices: z.array(z.string()).optional().describe("Device targets."),
        locations: z.array(z.string()).optional().describe("Placement targets."),
      },
    },
    async ({ ad_group_id, ...fields }) => {
      assertAllowed("spend", ctx.config.writeTier);
      const ag = ((await ctx.client.getAdGroup(ad_group_id)) as { data: { targeting?: Record<string, unknown> } }).data;
      const merged: Record<string, unknown> = { ...(ag.targeting ?? {}) };
      const changed: Record<string, { from: unknown; to: unknown }> = {};
      for (const [input, target] of Object.entries(TARGETING_KEYS)) {
        const value = (fields as Record<string, unknown>)[input];
        if (value !== undefined) {
          changed[target] = { from: merged[target], to: value };
          merged[target] = value;
        }
      }
      if (Object.keys(changed).length === 0) {
        throw new Error("update_targeting: pass at least one of geolocations, communities, interests, devices, locations.");
      }
      const result = await ctx.client.patchAdGroup(ad_group_id, { targeting: merged });
      return jsonResult({ ad_group_id, changed, result });
    }
  );

  return ["enable_items", "update_budget", "update_bid", "update_targeting"];
}
