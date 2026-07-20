import { describe, expect, it } from "vitest";
import { resolveMetrics, resolveBreakdowns, DEFAULT_METRICS } from "../src/metrics.js";

describe("resolveMetrics", () => {
  it("maps friendly names to Reddit enums", () => {
    expect(resolveMetrics(["impressions", "clicks", "spend"])).toEqual([
      "IMPRESSIONS",
      "CLICKS",
      "SPEND",
    ]);
  });

  it("handles the sign_up naming trap", () => {
    expect(resolveMetrics(["conversion_sign_up_clicks"])).toEqual(["CONVERSION_SIGN_UP_CLICKS"]);
  });

  it("rejects unknown names and suggests the closest valid one", () => {
    expect(() => resolveMetrics(["conversion_signup_clicks"])).toThrow(
      /Unknown metric 'conversion_signup_clicks'.*did you mean 'conversion_sign_up_clicks'/
    );
  });

  it("has sane defaults", () => {
    expect(DEFAULT_METRICS).toContain("impressions");
    expect(DEFAULT_METRICS).toContain("spend");
  });
});

describe("resolveBreakdowns", () => {
  it("maps and validates breakdown dimensions", () => {
    expect(resolveBreakdowns(["date", "campaign_id"])).toEqual(["DATE", "CAMPAIGN_ID"]);
    expect(() => resolveBreakdowns(["campain"])).toThrow(/did you mean 'campaign_id'/);
  });
});
