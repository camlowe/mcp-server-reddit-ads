import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, requireAccount, type ToolContext } from "./types.js";
import { assertAllowed } from "../gate.js";
import { toToolText } from "../errors.js";

/** Set the given query params on a URL, leaving every other param untouched. */
export function rewriteQueryParams(rawUrl: string, overrides: Record<string, string>): string {
  const url = new URL(rawUrl);
  for (const [key, value] of Object.entries(overrides)) url.searchParams.set(key, value);
  return url.toString();
}

const CREATIVE_FIELDS = ["headline", "creative_type", "thumbnail_url", "call_to_action", "body"] as const;

export function registerWorkflowTools(server: McpServer, ctx: ToolContext): string[] {
  server.registerTool(
    "copy_ads",
    {
      description:
        "Duplicate a set of ads into another ad group. Each copy is created PAUSED. Reddit creates a new " +
        "duplicate promoted post per copy. Optionally rewrite click_url query params (e.g. utm_campaign) for " +
        "the destination. One bad source id does not abort the rest.",
      inputSchema: {
        source_ad_ids: z.array(z.string()).min(1).describe("Ad ids to copy."),
        destination_ad_group_id: z.string().describe("Ad group the copies are created in."),
        account_id: z.string().optional().describe("Ad account id. Falls back to REDDIT_ADS_ACCOUNT_ID."),
        utm_overrides: z
          .record(z.string())
          .optional()
          .describe("Query params to set on each copy's click_url, e.g. { utm_campaign: 'remarketing-reddit' }."),
        name_suffix: z.string().optional().describe("Appended to each copy's name."),
      },
    },
    async ({ source_ad_ids, destination_ad_group_id, account_id, utm_overrides, name_suffix }) => {
      assertAllowed("safe", ctx.config.writeTier);
      const acct = requireAccount(ctx, account_id);
      const results: Array<Record<string, unknown>> = [];
      for (const sourceId of source_ad_ids) {
        try {
          const src = ((await ctx.client.getAd(sourceId)) as { data: Record<string, unknown> }).data;
          const body: Record<string, unknown> = {
            ad_group_id: destination_ad_group_id,
            name: `${String(src.name ?? "Copied ad")}${name_suffix ?? ""}`,
          };
          if (src.post_url) body.post_url = src.post_url;
          const click = src.click_url;
          if (typeof click === "string") {
            body.click_url = utm_overrides ? rewriteQueryParams(click, utm_overrides) : click;
          }
          for (const f of CREATIVE_FIELDS) if (src[f] != null) body[f] = src[f];
          const created = ((await ctx.client.createAd(acct, body)) as { data?: { id?: unknown } }).data;
          results.push({ source_ad_id: sourceId, ok: true, new_ad_id: created?.id, click_url: body.click_url });
        } catch (e) {
          results.push({ source_ad_id: sourceId, ok: false, error: toToolText(e) });
        }
      }
      return jsonResult({
        action: "copy_ads",
        destination_ad_group_id,
        note: "Each copy is a new PAUSED ad with its own duplicate promoted post.",
        results,
      });
    }
  );

  return ["copy_ads"];
}
