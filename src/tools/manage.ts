import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, type ToolContext } from "./types.js";
import { assertAllowed } from "../gate.js";
import { bulkPatch, patchByType } from "./patch-helpers.js";

const ITEM_TYPE = z.enum(["campaign", "ad_group", "ad"]);
const LAG_NOTE =
  "configured_status reflects the write immediately; effective_status can lag by a few minutes.";

export function registerManageTools(server: McpServer, ctx: ToolContext): string[] {
  server.registerTool(
    "pause_items",
    {
      description:
        "Pause one or more entities of a single type (campaigns, ad groups, or ads). One bad id does not " +
        "abort the rest; each result reports success and the read-back configured_status.",
      inputSchema: {
        item_type: ITEM_TYPE.describe("Type of every id in item_ids."),
        item_ids: z.array(z.string()).min(1).describe("Ids to pause (all of item_type)."),
      },
    },
    async ({ item_type, item_ids }) => {
      assertAllowed("safe", ctx.config.writeTier);
      const results = await bulkPatch(ctx.client, item_type, item_ids, { configured_status: "PAUSED" });
      return jsonResult({ action: "pause", item_type, note: LAG_NOTE, results });
    }
  );

  server.registerTool(
    "update_name",
    {
      description: "Rename a single entity (campaign, ad group, or ad).",
      inputSchema: {
        item_type: ITEM_TYPE.describe("Type of the entity."),
        item_id: z.string().describe("Entity id."),
        name: z.string().describe("New name."),
      },
    },
    async ({ item_type, item_id, name }) => {
      assertAllowed("safe", ctx.config.writeTier);
      return jsonResult(await patchByType(ctx.client, item_type, item_id, { name }));
    }
  );

  server.registerTool(
    "update_ad_comments",
    {
      description:
        "Turn commenting on an ad's promoted post on or off. This is the only property of a post the Reddit " +
        "API allows changing. Echoes old -> new.",
      inputSchema: {
        ad_id: z.string().describe("Ad id (the post is resolved from it)."),
        allow_comments: z.boolean().describe("true to allow comments on the ad, false to disable them."),
      },
    },
    async ({ ad_id, allow_comments }) => {
      assertAllowed("safe", ctx.config.writeTier);
      const ad = ((await ctx.client.getAd(ad_id)) as { data: { post_id?: string } }).data;
      if (!ad.post_id) throw new Error(`update_ad_comments: ad ${ad_id} has no post_id.`);
      const post = ((await ctx.client.getPost(ad.post_id)) as { data: { allow_comments?: boolean } }).data;
      const result = await ctx.client.patchPost(ad.post_id, { allow_comments });
      return jsonResult({
        ad_id,
        post_id: ad.post_id,
        old_allow_comments: post.allow_comments ?? null,
        new_allow_comments: allow_comments,
        result,
      });
    }
  );

  return ["pause_items", "update_name", "update_ad_comments"];
}
