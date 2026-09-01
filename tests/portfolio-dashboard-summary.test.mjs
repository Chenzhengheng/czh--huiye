import assert from "node:assert/strict";
import test from "node:test";

import { combinePortfolioSummaries } from "../scripts/portfolio-dashboard-summary.mjs";

const overseas = {
  source: "overseas",
  generatedAt: 1_800_000_000,
  trackingStartedAt: 1_700_000_000,
  today: { visits: 2, devices: 1 },
  last7Days: { visits: 5, devices: 3 },
  last30Days: { visits: 9, devices: 6 },
  daily: [{ day: "2026-08-31", visits: 2, devices: 1 }],
  latestVisitAt: 1_799_999_000,
};

const mainland = {
  source: "mainland",
  generatedAt: 1_800_000_005,
  trackingStartedAt: 1_799_000_000,
  today: { visits: 3, devices: 2 },
  last7Days: { visits: 7, devices: 4 },
  last30Days: { visits: 11, devices: 8 },
  daily: [
    { day: "2026-08-30", visits: 1, devices: 1 },
    { day: "2026-08-31", visits: 3, devices: 2 },
  ],
  latestVisitAt: 1_800_000_001,
};

test("combines two healthy deployment summaries without cross-domain device deduplication", () => {
  const result = combinePortfolioSummaries({ overseas, mainland });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.combined.today, { visits: 5, devices: 3 });
  assert.deepEqual(result.combined.last30Days, { visits: 20, devices: 14 });
  assert.deepEqual(result.combined.daily, [
    { day: "2026-08-30", visits: 1, devices: 1 },
    { day: "2026-08-31", visits: 5, devices: 3 },
  ]);
  assert.equal(result.combined.latestVisitAt, 1_800_000_001);
});

test("keeps the healthy source but withholds combined totals when one deployment fails", () => {
  const result = combinePortfolioSummaries({
    overseas,
    mainland: new Error("mainland timeout"),
  });
  assert.equal(result.status, "partial");
  assert.equal(result.combined, null);
  assert.equal(result.sources.overseas.status, "ok");
  assert.equal(result.sources.mainland.status, "error");
  assert.match(result.sources.mainland.error, /mainland timeout/);
});
