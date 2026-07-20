import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../src/retry.js";
import { RedditApiError } from "../src/errors.js";

const err = (status: number) => new RedditApiError("x", status, "GET", "/x");

describe("withRetry", () => {
  it("retries 429 then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(err(429)).mockResolvedValue("ok");
    await expect(withRetry(fn, { baseMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx up to 3 attempts then throws", async () => {
    const fn = vi.fn().mockRejectedValue(err(503));
    await expect(withRetry(fn, { baseMs: 1 })).rejects.toThrow(RedditApiError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("never retries 4xx (other than 429)", async () => {
    const fn = vi.fn().mockRejectedValue(err(400));
    await expect(withRetry(fn, { baseMs: 1 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
