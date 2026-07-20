import { describe, expect, it } from "vitest";
import { jsonResult, MAX_TOOL_OUTPUT_CHARS } from "../src/tools/types.js";

describe("jsonResult output cap", () => {
  it("returns small payloads as complete, parseable JSON", () => {
    const out = jsonResult({ a: 1, b: [2, 3] });
    expect(JSON.parse(out.content[0]!.text)).toEqual({ a: 1, b: [2, 3] });
  });

  it("truncates oversized payloads and appends guidance", () => {
    const big = Array.from({ length: 20_000 }, (_, i) => ({ id: String(i), name: "x".repeat(20) }));
    const out = jsonResult(big);
    const text = out.content[0]!.text;
    expect(text.length).toBeLessThan(MAX_TOOL_OUTPUT_CHARS + 300);
    expect(text).toContain("Output truncated");
    expect(text).toContain("Narrow the query");
  });

  it("leaves payloads exactly at the cap untouched", () => {
    // A string whose JSON representation ("..." with quotes) is exactly at the cap.
    const s = "y".repeat(MAX_TOOL_OUTPUT_CHARS - 2);
    const out = jsonResult(s);
    expect(out.content[0]!.text).not.toContain("Output truncated");
  });
});
