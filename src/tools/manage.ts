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

  return ["pause_items", "update_name"];
}
