import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSpendTools } from "../src/tools/spend.js";
import type { ToolContext, ToolResult } from "../src/tools/types.js";
import type { Config } from "../src/config.js";
import type { RedditAdsClient } from "../src/client.js";
import { GateError } from "../src/errors.js";

type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

function setup(tier: Config["writeTier"] = "spend") {
  const client = {
    patchCampaign: vi.fn(),
    patchAdGroup: vi.fn().mockResolvedValue({ data: { id: "g1" } }),
    patchAd: vi.fn(),
    getAdGroup: vi.fn().mockResolvedValue({ data: { goal_value: 10_000_000, bid_value: 400_000, targeting: {} } }),
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
  registerSpendTools(server, ctx);
  return { client, handlers };
}

const parse = (r: ToolResult) => JSON.parse(r.content[0]!.text);

describe("spend-tier tools", () => {
  it("gate blocks spend tools at safe tier (not just read)", async () => {
    const { handlers, client } = setup("safe");
    await expect(handlers.get("enable_items")!({ item_type: "ad", item_ids: ["1"] })).rejects.toBeInstanceOf(GateError);
    await expect(handlers.get("update_budget")!({ ad_group_id: "g1", daily_budget_usd: 20 })).rejects.toThrow(
      /requires write tier 'spend'/
    );
    expect(client.patchAdGroup).not.toHaveBeenCalled();
  });

  it("update_budget converts USD to microcurrency and echoes old -> new", async () => {
    const { handlers, client } = setup();
    const out = parse(await handlers.get("update_budget")!({ ad_group_id: "g1", daily_budget_usd: 30 }));
    const [, patch] = client.patchAdGroup.mock.calls[0]!;
    expect(patch.goal_value).toBe(30_000_000);
    expect(patch.goal_type).toBe("DAILY_SPEND");
    expect(out.old_daily_budget_usd).toBe(10);
    expect(out.new_daily_budget_usd).toBe(30);
  });

  it("update_bid converts USD to microcurrency and echoes old -> new", async () => {
    const { handlers, client } = setup();
    const out = parse(await handlers.get("update_bid")!({ ad_group_id: "g1", bid_usd: 1.5 }));
    expect(client.patchAdGroup.mock.calls[0]![1].bid_value).toBe(1_500_000);
    expect(out.old_bid_usd).toBe(0.4);
    expect(out.new_bid_usd).toBe(1.5);
  });

  it("update_targeting merges only provided keys and preserves the rest", async () => {
    const { handlers, client } = setup();
    client.getAdGroup.mockResolvedValue({
      data: { targeting: { excluded_geolocations: ["x"], communities: ["old"] } },
    });
    const out = parse(await handlers.get("update_targeting")!({ ad_group_id: "g1", communities: ["new"] }));
    const [, patch] = client.patchAdGroup.mock.calls[0]!;
    expect(patch.targeting.communities).toEqual(["new"]);
    expect(patch.targeting.excluded_geolocations).toEqual(["x"]);
    expect(out.changed.communities).toEqual({ from: ["old"], to: ["new"] });
  });

  it("update_targeting requires at least one field", async () => {
    const { handlers } = setup();
    await expect(handlers.get("update_targeting")!({ ad_group_id: "g1" })).rejects.toThrow(/at least one/);
  });
});
