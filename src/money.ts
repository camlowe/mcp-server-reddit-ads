const MICRO = 1_000_000;

export function microToUsd<T extends number | null | undefined>(v: T): T | number {
  return v == null ? v : v / MICRO;
}

export function usdToMicro(v: number): number {
  return Math.round(v * MICRO);
}

/** Money fields observed on campaigns/ad groups (values are microcurrency). */
export const ENTITY_MONEY_FIELDS = ["bid_value", "goal_value", "spend_cap"] as const;

export function withUsdFields<T extends Record<string, unknown>>(entity: T): T & Record<string, unknown> {
  const out: Record<string, unknown> = { ...entity };
  for (const f of ENTITY_MONEY_FIELDS) {
    if (f in entity) out[`${f}_usd`] = microToUsd(entity[f] as number | null | undefined);
  }
  return out as T & Record<string, unknown>;
}
