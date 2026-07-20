import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccountTools } from "../src/tools/accounts.js";
import { registerEntityTools } from "../src/tools/entities.js";
import { registerReportTools } from "../src/tools/reports.js";
import { registerTargetingTools } from "../src/tools/targeting.js";
import type { ToolContext, ToolResult } from "../src/tools/types.js";
import type { Config } from "../src/config.js";
import type { RedditAdsClient } from "../src/client.js";

type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

function setup(configOverrides: Partial<Config> = {}) {
  const client = {
    getAccounts: vi.fn(),
    listCampaigns: vi.fn().mockResolvedValue({ data: [], truncated: false }),
    getCampaign: vi.fn(),
    listAdGroups: vi.fn().mockResolvedValue({ data: [], truncated: false }),
    getAdGroup: vi.fn(),
    listAds: vi.fn().mockResolvedValue({ data: [], truncated: false }),
    getAd: vi.fn(),
    getPost: vi.fn(),
    report: vi.fn().mockResolvedValue({ metrics: [], metricsUpdatedAt: null, truncated: false }),
    searchSubreddits: vi.fn(),
    getInterests: vi.fn(),
    searchGeos: vi.fn(),
  };
  const config: Config = {
    clientId: "x",
    clientSecret: "x",
    refreshToken: "x",
    writeTier: "read",
    defaultAccountId: undefined,
    ...configOverrides,
  };
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _def: unknown, cb: Handler) => handlers.set(name, cb),
  } as unknown as McpServer;
  const ctx: ToolContext = { client: client as unknown as RedditAdsClient, config };
  registerAccountTools(server, ctx);
  registerEntityTools(server, ctx);
  registerReportTools(server, ctx);
  registerTargetingTools(server, ctx);
  return { client, handlers };
}

const parse = (r: ToolResult) => JSON.parse(r.content[0]!.text);

afterEach(() => vi.useRealTimers());

describe("read tools", () => {
  it("errors clearly when no account_id is given and no default is set", async () => {
    const { handlers } = setup();
    await expect(handlers.get("get_campaigns")!({})).rejects.toThrow(/No account_id/);
  });

  it("falls back to the configured default account and adds USD fields", async () => {
    const { client, handlers } = setup({ defaultAccountId: "a2_def" });
    client.listCampaigns.mockResolvedValue({ data: [{ id: "c", goal_value: 10_000_000 }], truncated: false });
    const out = parse(await handlers.get("get_campaigns")!({}));
    expect(client.listCampaigns).toHaveBeenCalledWith("a2_def");
    expect(out[0].goal_value_usd).toBe(10);
  });

  it("get_performance_report surfaces a suggestion for an unknown metric and does not call the API", async () => {
    const { client, handlers } = setup();
    await expect(
      handlers.get("get_performance_report")!({ account_id: "a2_x", metrics: ["conversion_signup_clicks"] })
    ).rejects.toThrow(/did you mean 'conversion_sign_up_clicks'/);
    expect(client.report).not.toHaveBeenCalled();
  });

  it("get_performance_report resolves friendly names to Reddit enums before the call", async () => {
    const { client, handlers } = setup();
    await handlers.get("get_performance_report")!({
      account_id: "a2_x",
      metrics: ["spend"],
      breakdowns: ["date"],
    });
    expect(client.report).toHaveBeenCalledWith(
      "a2_x",
      expect.objectContaining({ fields: ["SPEND"], breakdowns: ["DATE"] })
    );
  });

  it("get_daily_performance builds the trailing-N-day date range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
    const { client, handlers } = setup();
    await handlers.get("get_daily_performance")!({ account_id: "a2_x", days: 7 });
    expect(client.report).toHaveBeenCalledWith(
      "a2_x",
      expect.objectContaining({ startDate: "2026-07-13", endDate: "2026-07-20", breakdowns: ["DATE"] })
    );
  });

  it("get_account_overview counts entities by effective status", async () => {
    const { client, handlers } = setup();
    client.listCampaigns.mockResolvedValue({
      data: [{ effective_status: "ACTIVE" }, { effective_status: "PAUSED" }],
      truncated: false,
    });
    client.listAdGroups.mockResolvedValue({ data: [{ effective_status: "ACTIVE" }], truncated: false });
    client.listAds.mockResolvedValue({
      data: [{ effective_status: "PAUSED" }, { effective_status: "PAUSED" }],
      truncated: false,
    });
    client.report.mockResolvedValue({
      metrics: [{ date: "2026-07-01", spend: 5 }],
      metricsUpdatedAt: "t",
      truncated: false,
    });
    const out = parse(await handlers.get("get_account_overview")!({ account_id: "a2_x" }));
    expect(out.counts.campaigns).toEqual({ ACTIVE: 1, PAUSED: 1 });
    expect(out.counts.ad_groups).toEqual({ ACTIVE: 1 });
    expect(out.counts.ads).toEqual({ PAUSED: 2 });
    expect(typeof out.spend.last_7_days.spend_usd).toBe("number");
  });

  it("list tools filter client-side on configured_status when status is given", async () => {
    const { client, handlers } = setup({ defaultAccountId: "a2_def" });
    client.listCampaigns.mockResolvedValue({
      data: [
        { id: "c1", configured_status: "ACTIVE" },
        { id: "c2", configured_status: "PAUSED" },
      ],
      truncated: false,
    });
    const out = parse(await handlers.get("get_campaigns")!({ status: "PAUSED" }));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("c2");

    client.listAds.mockResolvedValue({
      data: [
        { id: "a1", configured_status: "ACTIVE" },
        { id: "a2", configured_status: "ACTIVE" },
        { id: "a3", configured_status: "PAUSED" },
      ],
      truncated: false,
    });
    const ads = parse(await handlers.get("get_ads")!({ status: "ACTIVE" }));
    expect(ads.map((a: { id: string }) => a.id)).toEqual(["a1", "a2"]);
  });

  it("get_ad_creative resolves the ad's post and returns its creative", async () => {
    const { client, handlers } = setup();
    client.getAd.mockResolvedValue({ data: { id: "ad1", post_id: "t3_x" } });
    client.getPost.mockResolvedValue({
      data: { id: "t3_x", headline: "Buy the thing", body: "", allow_comments: true },
    });
    const out = parse(await handlers.get("get_ad_creative")!({ ad_id: "ad1" }));
    expect(client.getPost).toHaveBeenCalledWith("t3_x");
    expect(out.ad_id).toBe("ad1");
    expect(out.creative.headline).toBe("Buy the thing");
  });

  it("get_ad_creative errors clearly when the ad has no post", async () => {
    const { client, handlers } = setup();
    client.getAd.mockResolvedValue({ data: { id: "ad1" } });
    await expect(handlers.get("get_ad_creative")!({ ad_id: "ad1" })).rejects.toThrow(/no post_id/);
  });

  it("targeting tools pass the query through", async () => {
    const { client, handlers } = setup();
    await handlers.get("search_subreddits")!({ query: "gaming" });
    expect(client.searchSubreddits).toHaveBeenCalledWith("gaming");
  });

  it("find_entity matches names case-insensitively across all types", async () => {
    const { client, handlers } = setup({ defaultAccountId: "a2_def" });
    client.listCampaigns.mockResolvedValue({
      data: [
        { id: "c1", name: "AV Engineers", configured_status: "ACTIVE" },
        { id: "c2", name: "Other", configured_status: "PAUSED" },
      ],
      truncated: false,
    });
    client.listAdGroups.mockResolvedValue({
      data: [{ id: "g1", name: "av engineers - broad", campaign_id: "c1", configured_status: "ACTIVE" }],
      truncated: false,
    });
    client.listAds.mockResolvedValue({ data: [{ id: "a1", name: "unrelated" }], truncated: false });
    const out = parse(await handlers.get("find_entity")!({ query: "AV Engineer" }));
    expect(out.matches.map((m: { type: string; id: string }) => [m.type, m.id])).toEqual([
      ["campaign", "c1"],
      ["ad_group", "g1"],
    ]);
  });

  it("find_entity restricts the search when entity_type is given", async () => {
    const { client, handlers } = setup({ defaultAccountId: "a2_def" });
    client.listCampaigns.mockResolvedValue({ data: [{ id: "c1", name: "X" }], truncated: false });
    await handlers.get("find_entity")!({ query: "x", entity_type: "campaign" });
    expect(client.listCampaigns).toHaveBeenCalled();
    expect(client.listAdGroups).not.toHaveBeenCalled();
    expect(client.listAds).not.toHaveBeenCalled();
  });

  it("compare_periods runs back-to-back windows and computes deltas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
    const { client, handlers } = setup({ defaultAccountId: "a2_def" });
    client.report
      .mockResolvedValueOnce({ metrics: [{ spend: 100, clicks: 50 }], metricsUpdatedAt: "t", truncated: false })
      .mockResolvedValueOnce({ metrics: [{ spend: 80, clicks: 100 }], metricsUpdatedAt: "t", truncated: false });
    const out = parse(await handlers.get("compare_periods")!({ days: 7 }));
    expect(client.report).toHaveBeenNthCalledWith(
      1,
      "a2_def",
      expect.objectContaining({ startDate: "2026-07-13", endDate: "2026-07-20" })
    );
    expect(client.report).toHaveBeenNthCalledWith(
      2,
      "a2_def",
      expect.objectContaining({ startDate: "2026-07-05", endDate: "2026-07-12" })
    );
    expect(out.changes.spend).toEqual({ current: 100, previous: 80, change: 20, change_pct: 25 });
    expect(out.changes.clicks.change_pct).toBe(-50);
  });

  it("compare_ads joins per-ad metrics with names and headlines, sorted by spend", async () => {
    const { client, handlers } = setup({ defaultAccountId: "a2_def" });
    client.listAds.mockResolvedValue({
      data: [
        { id: "a1", name: "Ad One", post_id: "t3_1", configured_status: "ACTIVE" },
        { id: "a2", name: "Ad Two", post_id: "t3_2", configured_status: "PAUSED" },
      ],
      truncated: false,
    });
    client.report.mockResolvedValue({
      metrics: [
        { ad_id: "a2", spend: 40, clicks: 8 },
        { ad_id: "a1", spend: 60, clicks: 3 },
      ],
      metricsUpdatedAt: "t",
      truncated: false,
    });
    client.getPost.mockImplementation(async (id: string) =>
      id === "t3_1" ? { data: { headline: "H1" } } : Promise.reject(new Error("boom"))
    );
    const out = parse(await handlers.get("compare_ads")!({ ad_group_id: "g1" }));
    expect(client.listAds).toHaveBeenCalledWith("a2_def", "g1");
    expect(out.ads[0]).toMatchObject({ ad_id: "a1", name: "Ad One", headline: "H1", spend: 60 });
    expect(out.ads[1]).toMatchObject({ ad_id: "a2", headline: null, spend: 40 });
  });
});
