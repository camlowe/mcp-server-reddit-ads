import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, type ToolContext } from "./types.js";

export function registerTargetingTools(server: McpServer, ctx: ToolContext): string[] {
  server.registerTool(
    "search_subreddits",
    {
      description: "Search targetable subreddits (communities) by name/keyword.",
      inputSchema: { query: z.string().describe("Search text, e.g. 'gaming'.") },
    },
    async ({ query }) => jsonResult(await ctx.client.searchSubreddits(query))
  );

  server.registerTool(
    "get_interest_categories",
    {
      description: "List Reddit's interest targeting categories.",
      inputSchema: {},
    },
    async () => jsonResult(await ctx.client.getInterests())
  );

  server.registerTool(
    "search_geo_targets",
    {
      description: "Search geographic targets (countries, regions, metros) by name.",
      inputSchema: { query: z.string().describe("Search text, e.g. 'united'.") },
    },
    async ({ query }) => jsonResult(await ctx.client.searchGeos(query))
  );

  return ["search_subreddits", "get_interest_categories", "search_geo_targets"];
}
