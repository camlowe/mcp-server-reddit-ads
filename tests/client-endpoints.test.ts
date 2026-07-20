import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { RedditAdsClient } from "../src/client.js";

const fakeTokens = { getAccessToken: async () => "AT" };
const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/${name}`, "utf8"));

// Fresh Response per call so repeated assertions on the same client don't hit a drained body.
function capture(json: unknown) {
  return vi.fn().mockImplementation(async () => new Response(JSON.stringify(json), { status: 200 }));
}

describe("RedditAdsClient endpoints", () => {
  it("getAccounts walks businesses and aggregates ad accounts", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "b1" }, { id: "b2" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "a2_1" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "a2_2" }] }), { status: 200 }));
    const c = new RedditAdsClient(fakeTokens, f);
    const accounts = await c.getAccounts();
    expect(accounts.map((a) => a.id)).toEqual(["a2_1", "a2_2"]);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("getCampaign hits the bare path", async () => {
    const f = capture({ data: { id: "c1" } });
    const c = new RedditAdsClient(fakeTokens, f);
    await c.getCampaign("c1");
    expect(f.mock.calls[0]![0]).toBe("https://ads-api.reddit.com/api/v3/campaigns/c1");
  });

  it("listAdGroups adds campaign_id filter when given", async () => {
    const f = capture({ data: [] });
    const c = new RedditAdsClient(fakeTokens, f);
    await c.listAdGroups("a2_x", "camp1");
    expect(f.mock.calls[0]![0]).toBe(
      "https://ads-api.reddit.com/api/v3/ad_accounts/a2_x/ad_groups?campaign_id=camp1"
    );
  });

  it("listAds adds ad_group_id filter when given", async () => {
    const f = capture({ data: [] });
    const c = new RedditAdsClient(fakeTokens, f);
    await c.listAds("a2_x", "g1");
    expect(f.mock.calls[0]![0]).toBe(
      "https://ads-api.reddit.com/api/v3/ad_accounts/a2_x/ads?ad_group_id=g1"
    );
  });

  it("patchCampaign and patchAdGroup PATCH bare paths with a data envelope", async () => {
    const f = capture({ data: {} });
    const c = new RedditAdsClient(fakeTokens, f);
    await c.patchCampaign("c1", { name: "x" });
    await c.patchAdGroup("g1", { configured_status: "ACTIVE" });
    expect(f.mock.calls[0]![0]).toBe("https://ads-api.reddit.com/api/v3/campaigns/c1");
    expect(f.mock.calls[0]![1].method).toBe("PATCH");
    expect(JSON.parse(f.mock.calls[1]![1].body)).toEqual({ data: { configured_status: "ACTIVE" } });
  });

  it("createAd posts to the account-scoped path with configured_status defaulted to PAUSED", async () => {
    const f = capture({ data: { id: "new1", configured_status: "PAUSED" } });
    const c = new RedditAdsClient(fakeTokens, f);
    await c.createAd("a2_x", { ad_group_id: "g1", name: "Ad", post_url: "https://reddit.com/comments/abc" });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toContain("/ad_accounts/a2_x/ads");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).data.configured_status).toBe("PAUSED");
  });

  it("createCampaign and createAdGroup post account-scoped and default to PAUSED", async () => {
    const f = capture({ data: { id: "n" } });
    const c = new RedditAdsClient(fakeTokens, f);
    await c.createCampaign("a2_x", { name: "C", objective: "CONVERSIONS" });
    await c.createAdGroup("a2_x", { campaign_id: "c1", name: "G" });
    expect(f.mock.calls[0]![0]).toContain("/ad_accounts/a2_x/campaigns");
    expect(JSON.parse(f.mock.calls[0]![1].body).data.configured_status).toBe("PAUSED");
    expect(f.mock.calls[1]![0]).toContain("/ad_accounts/a2_x/ad_groups");
    expect(JSON.parse(f.mock.calls[1]![1].body).data.configured_status).toBe("PAUSED");
  });

  it("report converts money metrics to USD and passes metrics_updated_at through", async () => {
    const f = capture(fixture("report.json"));
    const c = new RedditAdsClient(fakeTokens, f);
    const r = await c.report("a2_x", {
      fields: ["DATE", "SPEND", "CPC"],
      startDate: "2026-07-01",
      endDate: "2026-07-02",
    });
    expect(r.metrics[0]!.spend).toBeCloseTo(51.04, 2);
    expect(r.metrics[0]!.cpc).toBeCloseTo(0.51, 2);
    expect(r.metricsUpdatedAt).toBe("2026-07-20T02:16:44Z");
  });

  it("report sends ISO 8601 dates and a data envelope", async () => {
    const f = capture(fixture("report.json"));
    const c = new RedditAdsClient(fakeTokens, f);
    await c.report("a2_x", { fields: ["SPEND"], startDate: "2026-07-01", endDate: "2026-07-02", breakdowns: ["DATE"] });
    const body = JSON.parse(f.mock.calls[0]![1].body);
    expect(f.mock.calls[0]![0]).toContain("/ad_accounts/a2_x/reports");
    expect(f.mock.calls[0]![1].method).toBe("POST");
    expect(body.data.starts_at).toBe("2026-07-01T00:00:00Z");
    expect(body.data.ends_at).toBe("2026-07-02T00:00:00Z");
    expect(body.data.fields).toEqual(["SPEND"]);
    expect(body.data.breakdowns).toEqual(["DATE"]);
  });

  it("targeting endpoints hit /targeting/* with a query param", async () => {
    const f = capture({ data: [] });
    const c = new RedditAdsClient(fakeTokens, f);
    await c.searchSubreddits("gaming");
    await c.getInterests();
    await c.searchGeos("united");
    expect(f.mock.calls[0]![0]).toBe("https://ads-api.reddit.com/api/v3/targeting/subreddits?query=gaming");
    expect(f.mock.calls[1]![0]).toBe("https://ads-api.reddit.com/api/v3/targeting/interests");
    expect(f.mock.calls[2]![0]).toBe("https://ads-api.reddit.com/api/v3/targeting/geos?query=united");
  });

  it("follows pagination across pages and concatenates results", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "c1" }],
            pagination: { next_url: "https://ads-api.reddit.com/api/v3/ad_accounts/a2_x/campaigns?page=2" },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: "c2" }], pagination: { next_url: null } }), { status: 200 })
      );
    const c = new RedditAdsClient(fakeTokens, f);
    const res = await c.listCampaigns("a2_x");
    expect((res.data as Array<{ id: string }>).map((x) => x.id)).toEqual(["c1", "c2"]);
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1]![0]).toBe("https://ads-api.reddit.com/api/v3/ad_accounts/a2_x/campaigns?page=2");
  });
});
