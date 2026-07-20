import type { RedditAdsClient } from "../client.js";
import { toToolText } from "../errors.js";

export type ItemType = "campaign" | "ad_group" | "ad";

type Patch = Record<string, unknown>;

export function patchByType(client: RedditAdsClient, type: ItemType, id: string, patch: Patch): Promise<unknown> {
  if (type === "campaign") return client.patchCampaign(id, patch);
  if (type === "ad_group") return client.patchAdGroup(id, patch);
  return client.patchAd(id, patch);
}

export interface ItemOutcome {
  id: string;
  ok: boolean;
  configured_status?: unknown;
  error?: string;
}

/**
 * Apply the same patch to many entities, one at a time. A failure on one id is
 * recorded and does not abort the rest. Success is confirmed by reading back
 * `configured_status` from each PATCH response (effective_status lags by minutes).
 */
export async function bulkPatch(
  client: RedditAdsClient,
  type: ItemType,
  ids: string[],
  patch: Patch
): Promise<ItemOutcome[]> {
  const results: ItemOutcome[] = [];
  for (const id of ids) {
    try {
      const res = (await patchByType(client, type, id, patch)) as { data?: { configured_status?: unknown } };
      results.push({ id, ok: true, configured_status: res.data?.configured_status });
    } catch (e) {
      results.push({ id, ok: false, error: toToolText(e) });
    }
  }
  return results;
}
