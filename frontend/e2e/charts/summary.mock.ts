import type { Page, Route } from "@playwright/test";

// Stands in for GET .../readings/summary until the API route has merged
// (.claude/handoffs/ui-work/READINGS.md): the same buckets, computed from a
// synthetic gauge that reads every `stepMin` minutes since `startMs`.

const STEPS = [
  60, 300, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 259200,
  604800,
];
const DAY = 86400000;

export interface SummaryMock {
  /** First reading (ms); defaults to two years ago. */
  startMs?: number;
  /** Minutes between readings. */
  stepMin?: number;
  /** A stretch with no readings (ms), to check gaps. */
  hole?: [number, number];
  /** Called for every request, to assert what the chart asked for. */
  onRequest?: (query: URLSearchParams) => void;
}

function level(t: number): number {
  return 100 + 30 * Math.sin(t / (3 * DAY)) + 8 * Math.sin(t / (0.4 * DAY));
}

/** The API's answer for one request. */
export function summarize(
  query: URLSearchParams,
  opts: SummaryMock,
  now = Date.now(),
) {
  const to = query.get("to") ? Date.parse(query.get("to") as string) : now;
  const from = query.get("from")
    ? Date.parse(query.get("from") as string)
    : to - 7 * DAY;
  const points = Math.min(
    Math.max(Number(query.get("points") ?? 300), 10),
    1000,
  );
  const stepMs = (opts.stepMin ?? 15) * 60000;
  const start = opts.startMs ?? now - 2 * 365 * DAY;
  const first = Math.max(Math.ceil(Math.max(from, start) / stepMs) * stepMs, 0);
  const times: number[] = [];
  for (let t = first; t <= Math.min(to, now); t += stepMs) {
    if (opts.hole && t >= opts.hole[0] && t < opts.hole[1]) continue;
    times.push(t);
  }
  const iso = (t: number) => new Date(t).toISOString();
  if (times.length <= points) {
    return {
      bucket_seconds: 0,
      from: iso(from),
      to: iso(to),
      items: times.map((t) => ({
        measured_at: iso(t),
        value: level(t),
        min: level(t),
        max: level(t),
        count: 1,
      })),
    };
  }
  const want = (to - from) / 1000 / points;
  const bucket = STEPS.find((s) => s >= want) ?? STEPS[STEPS.length - 1];
  const size = bucket * 1000;
  const groups = new Map<number, number[]>();
  for (const t of times) {
    const key = Math.floor(t / size) * size;
    const g = groups.get(key);
    if (g) g.push(level(t));
    else groups.set(key, [level(t)]);
  }
  return {
    bucket_seconds: bucket,
    from: iso(from),
    to: iso(to),
    items: [...groups].map(([t, v]) => ({
      measured_at: iso(t),
      value: v.reduce((a, b) => a + b, 0) / v.length,
      min: Math.min(...v),
      max: Math.max(...v),
      count: v.length,
    })),
  };
}

/** Answer every readings summary request of the page from the synthetic
 * gauge. Returns the requests seen, newest last. */
export async function mockSummary(page: Page, opts: SummaryMock = {}) {
  const seen: URLSearchParams[] = [];
  await page.route(/\/readings\/summary(\?|$)/, (route: Route) => {
    const query = new URL(route.request().url()).searchParams;
    seen.push(query);
    opts.onRequest?.(query);
    return route.fulfill({ json: summarize(query, opts) });
  });
  return seen;
}
