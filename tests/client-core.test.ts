import { describe, expect, it, vi } from "vitest";
import { RedditAdsClient } from "../src/client.js";
import { RedditApiError } from "../src/errors.js";

const fakeTokens = { getAccessToken: async () => "AT" };

// Fresh Response per call: a Response body is a one-shot stream and several
// cases here re-invoke fetch (retry on 5xx, repeated getAd assertions).
function mockFetch(status: number, json: unknown) {
  return vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } })
  );
}

describe("RedditAdsClient request layer", () => {
  it("sends bearer auth, user-agent, and JSON on the right URL", async () => {
    const f = mockFetch(200, { data: [] });
    const c = new RedditAdsClient(fakeTokens, f);
    await c.listCampaigns("a2_x");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://ads-api.reddit.com/api/v3/ad_accounts/a2_x/campaigns");
    expect(init.headers.Authorization).toBe("Bearer AT");
    expect(init.headers["User-Agent"]).toBeTruthy();
  });

  it("updates via PATCH on the BARE path with a data envelope", async () => {
    const f = mockFetch(200, { data: { id: "1", configured_status: "PAUSED" } });
    const c = new RedditAdsClient(fakeTokens, f);
    await c.patchAd("123", { configured_status: "PAUSED" });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://ads-api.reddit.com/api/v3/ads/123");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ data: { configured_status: "PAUSED" } });
  });

  it("classifies a 404 on a known route as resource-not-found", async () => {
    const f = mockFetch(404, {});
    const c = new RedditAdsClient(fakeTokens, f);
    await expect(c.getAd("999")).rejects.toThrow(/not found.*999/i);
  });

  it("carries status/method/path on API errors", async () => {
    const f = mockFetch(500, { error: "boom" });
    const c = new RedditAdsClient(fakeTokens, f, { baseMs: 1 });
    try {
      await c.getAd("1");
      expect.unreachable();
    } catch (e) {
      const err = e as RedditApiError;
      expect(err.status).toBe(500);
      expect(err.method).toBe("GET");
      expect(err.path).toContain("/ads/1");
    }
  });

  it("extracts the offending field from Reddit's enum-dump 400s", async () => {
    const dump = {
      error: {
        code: 400,
        fields: [{ field: "data/fields/6", message: "'CONVERSION_SIGNUP_CLICKS' is not one of ['IMPRESSIONS', ...]" }],
        message: "Bad Request",
      },
    };
    const f = mockFetch(400, dump);
    const c = new RedditAdsClient(fakeTokens, f);
    await expect(c.getAd("1")).rejects.toThrow(/CONVERSION_SIGNUP_CLICKS/);
    await expect(c.getAd("1")).rejects.not.toThrow(/IMPRESSIONS', '/); // no full dump
  });
});
