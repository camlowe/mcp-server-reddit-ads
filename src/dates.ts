const DAY_MS = 86_400_000;

/** UTC calendar date (YYYY-MM-DD) `n` days before `now`. Reddit ad accounts report in GMT. */
export function isoDaysAgo(n: number, now: Date = new Date()): string {
  return new Date(now.getTime() - n * DAY_MS).toISOString().slice(0, 10);
}

export const todayIso = (now: Date = new Date()): string => isoDaysAgo(0, now);
