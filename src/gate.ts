import { GateError } from "./errors.js";

export type Tier = "read" | "safe" | "spend";

const RANK: Record<Tier, number> = { read: 0, safe: 1, spend: 2 };

export function isAllowed(required: Tier, configured: Tier): boolean {
  return RANK[configured] >= RANK[required];
}

export function assertAllowed(required: Tier, configured: Tier): void {
  if (isAllowed(required, configured)) return;
  throw new GateError(
    `This tool requires write tier '${required}' but the server is currently '${configured}'. ` +
      `To unlock it, set REDDIT_ADS_WRITE_TIER=${required} in the server's env and restart. ` +
      `Tiers: read (default, no writes) < safe (pause, create-as-paused, rename, copy) < spend (enable, budget, bid, targeting).`
  );
}
