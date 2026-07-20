import { RedditApiError } from "./errors.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 500;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const retryable =
        (e instanceof RedditApiError && (e.status === 429 || e.status >= 500)) ||
        (e instanceof TypeError); // network failure from fetch
      if (!retryable || i === attempts - 1) throw e;
      await sleep(baseMs * 2 ** i);
    }
  }
  throw lastErr;
}
