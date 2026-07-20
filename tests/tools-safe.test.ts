import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateTools } from "../src/tools/create.js";
import { registerManageTools } from "../src/tools/manage.js";
import type { ToolContext, ToolResult } from "../src/tools/types.js";
import type { Config } from "../src/config.js";
import type { RedditAdsClient } from "../src/client.js";
import { GateError } from "../src/errors.js";

type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

function setup(tier: Config["writeTier"] = "safe") {
  const client = {
    createCampaign: vi.fn().mockResolvedValue({ data: { id: "new", configured_status: "PAUSED" } }),
    createAdGroup: vi.fn().mockResolvedValue({ data: { id: "new", configured_status: "PAUSED" } }),
    createAd: vi.fn().mockResolvedValue({ data: { id: "new", configured_status: "PAUSED" } }),
    patchCampaign: vi.fn(),
    patchAdGroup: vi.fn(),
    patchAd: vi.fn(),
    getAd: vi.fn().mockResolvedValue({ data: { id: "ad1", post_id: "t3_x" } }),
    getPost: vi.fn().mockResolvedValue({ data: { id: "t3_x", allow_comments: true } }),
    patchPost: vi.fn().mockResolvedValue({ data: { id: "t3_x", allow_comments: false } }),
  };
  const config: Config = {
    clientId: "x",
    clientSecret: "x",
    refreshToken: "x",
    writeTier: tier,
    defaultAccountId: "a2_def",
  };
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _def: unknown, cb: Handler) => handlers.set(name, cb),
  } as unknown as McpServer;
  const ctx: ToolContext = { client: client as unknown as RedditAdsClient, config };
  registerCreateTools(server, ctx);
  registerManageTools(server, ctx);
  return { client, handlers };
}

const parse = (r: ToolResult) => JSON.parse(r.content[0]!.text);

describe("safe-write tools", () => {
  it("gate blocks safe tools at read tier with an actionable message", async () => {
    const { handlers, client } = setup("read");
    await expect(
      handlers.get("create_campaign")!({ name: "C", objective: "CONVERSIONS" })
    ).rejects.toBeInstanceOf(GateError);
    await expect(
      handlers.get("create_campaign")!({ name: "C", objective: "CONVERSIONS" })
    ).rejects.toThrow(/requires write tier 'safe'/);
    expect(client.createCampaign).not.toHaveBeenCalled();
  });

  it("create_campaign fails locally when CBO is on without a pixel", async () => {
    const { handlers, client } = setup();
    await expect(
      handlers.get("create_campaign")!({ name: "C", objective: "CONVERSIONS", is_campaign_budget_optimization: true })
    ).rejects.toThrow(/conversion_pixel_id is required/);
    expect(client.createCampaign).not.toHaveBeenCalled();
  });

  it("create_ad_group converts daily budget to microcurrency and passes the pixel", async () => {
    const { handlers, client } = setup();
    await handlers.get("create_ad_group")!({
      campaign_id: "c1",
      name: "G",
      conversion_pixel_id: "a2_def",
      daily_budget_usd: 30,
      bid_usd: 1.5,
      bid_strategy: "MAXIMIZE_VOLUME",
    });
    const [acct, body] = client.createAdGroup.mock.calls[0]!;
    expect(acct).toBe("a2_def");
    expect(body.goal_value).toBe(30_000_000);
    expect(body.goal_type).toBe("DAILY_SPEND");
    expect(body.bid_value).toBe(1_500_000);
    expect(body.conversion_pixel_id).toBe("a2_def");
  });

  it("create_ad requires post_url or headline+click_url", async () => {
    const { handlers, client } = setup();
    await expect(
      handlers.get("create_ad")!({ ad_group_id: "g1", name: "Ad", headline: "hi" })
    ).rejects.toThrow(/post_url .* or both headline and click_url/);
    expect(client.createAd).not.toHaveBeenCalled();
  });

  it("pause_items continues past a failing id and confirms via configured_status", async () => {
    const { handlers, client } = setup();
    client.patchAd.mockImplementation(async (id: string) => {
      if (id === "bad") throw new Error("Reddit resource not found: PATCH /ads/bad");
      return { data: { id, configured_status: "PAUSED" } };
    });
    const out = parse(await handlers.get("pause_items")!({ item_type: "ad", item_ids: ["1", "bad", "2"] }));
    expect(out.results).toHaveLength(3);
    expect(out.results[0]).toMatchObject({ id: "1", ok: true, configured_status: "PAUSED" });
    expect(out.results[1]).toMatchObject({ id: "bad", ok: false });
    expect(out.results[1].error).toMatch(/not found/);
    expect(out.results[2]).toMatchObject({ id: "2", ok: true, configured_status: "PAUSED" });
    expect(out.note).toMatch(/effective_status/);
  });

  it("update_name patches the right entity type", async () => {
    const { handlers, client } = setup();
    client.patchCampaign.mockResolvedValue({ data: { id: "c1", name: "New" } });
    await handlers.get("update_name")!({ item_type: "campaign", item_id: "c1", name: "New" });
    expect(client.patchCampaign).toHaveBeenCalledWith("c1", { name: "New" });
  });

  it("update_ad_comments resolves the ad's post and echoes old -> new", async () => {
    const { handlers, client } = setup();
    const out = parse(await handlers.get("update_ad_comments")!({ ad_id: "ad1", allow_comments: false }));
    expect(client.patchPost).toHaveBeenCalledWith("t3_x", { allow_comments: false });
    expect(out.old_allow_comments).toBe(true);
    expect(out.new_allow_comments).toBe(false);
  });

  it("update_ad_comments is gated at safe tier", async () => {
    const { handlers, client } = setup("read");
    await expect(handlers.get("update_ad_comments")!({ ad_id: "ad1", allow_comments: false })).rejects.toThrow(
      /requires write tier 'safe'/
    );
    expect(client.patchPost).not.toHaveBeenCalled();
  });
});
