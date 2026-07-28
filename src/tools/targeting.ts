import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { READ_ONLY, jsonResult, type ToolContext } from "./types.js";

export function registerTargetingTools(server: McpServer, ctx: ToolContext): string[] {
  server.registerTool(
    "search_subreddits",
    {
      annotations: READ_ONLY,
      description:
        "Search targetable subreddits (communities) by name or keyword. Returns the ids to pass as " +
        "communities to update_targeting, which needs Reddit ids rather than display names. Read-only " +
        "lookup: it does not change any targeting by itself.",
      inputSchema: { query: z.string().describe("Search text, e.g. 'gaming'.") },
    },
    async ({ query }) => jsonResult(await ctx.client.searchSubreddits(query))
  );

  server.registerTool(
    "get_interest_categories",
    {
      annotations: READ_ONLY,
      description:
        "List Reddit's interest targeting categories. Returns the ids to pass as interests to " +
        "update_targeting. Takes no arguments and returns the whole catalogue, so call it once and " +
        "reuse the result rather than per ad group.",
      inputSchema: {},
    },
    async () => jsonResult(await ctx.client.getInterests())
  );

  server.registerTool(
    "search_geo_targets",
    {
      annotations: READ_ONLY,
      description:
        "Search geographic targets (countries, regions, and metros) by name. Returns the ids to pass " +
        "as geolocations to update_targeting, which needs Reddit geo ids rather than plain place " +
        "names. Read-only lookup: it does not change any targeting by itself.",
      inputSchema: { query: z.string().describe("Search text, e.g. 'united'.") },
    },
    async ({ query }) => jsonResult(await ctx.client.searchGeos(query))
  );

  return ["search_subreddits", "get_interest_categories", "search_geo_targets"];
}
