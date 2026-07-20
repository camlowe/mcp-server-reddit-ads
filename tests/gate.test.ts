import { describe, expect, it } from "vitest";
import { assertAllowed } from "../src/gate.js";
import { GateError } from "../src/errors.js";

describe("assertAllowed", () => {
  it("allows read tools at every tier", () => {
    expect(() => assertAllowed("read", "read")).not.toThrow();
    expect(() => assertAllowed("read", "safe")).not.toThrow();
    expect(() => assertAllowed("read", "spend")).not.toThrow();
  });

  it("blocks safe tools at read tier with an actionable message", () => {
    try {
      assertAllowed("safe", "read");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GateError);
      const msg = (e as GateError).message;
      expect(msg).toContain("requires write tier 'safe'");
      expect(msg).toContain("currently 'read'");
      expect(msg).toContain("REDDIT_ADS_WRITE_TIER=safe");
    }
  });

  it("blocks spend tools at safe tier", () => {
    expect(() => assertAllowed("spend", "safe")).toThrow(GateError);
  });

  it("allows safe and spend tools at spend tier", () => {
    expect(() => assertAllowed("safe", "spend")).not.toThrow();
    expect(() => assertAllowed("spend", "spend")).not.toThrow();
  });
});
