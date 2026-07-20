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

  it("targeting tools pass the query through", async () => {
    const { client, handlers } = setup();
    await handlers.get("search_subreddits")!({ query: "gaming" });
    expect(client.searchSubreddits).toHaveBeenCalledWith("gaming");
  });
});
