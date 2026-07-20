import { describe, expect, it } from "vitest";
import { microToUsd, usdToMicro, withUsdFields } from "../src/money.js";

describe("money", () => {
  it("converts microcurrency to USD", () => {
    expect(microToUsd(1_487_494_801)).toBeCloseTo(1487.49, 2);
    expect(microToUsd(null)).toBeNull();
    expect(microToUsd(undefined)).toBeUndefined();
  });

  it("converts USD to integer microcurrency", () => {
    expect(usdToMicro(30)).toBe(30_000_000);
    expect(usdToMicro(1.5)).toBe(1_500_000);
  });

  it("adds *_usd siblings for known money fields without mutating raw values", () => {
    const entity = { id: "x", bid_value: 400000, goal_value: 10000000, spend_cap: null };
    const out = withUsdFields(entity);
    expect(out.bid_value).toBe(400000);
    expect(out.bid_value_usd).toBe(0.4);
    expect(out.goal_value_usd).toBe(10);
    expect(out.spend_cap_usd).toBeNull();
  });
});
