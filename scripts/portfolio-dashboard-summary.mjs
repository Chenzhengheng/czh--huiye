const SOURCE_NAMES = ["mainland", "overseas"];
const PERIOD_NAMES = ["today", "last7Days", "last30Days"];

function addPeriod(left, right) {
  return {
    visits: left.visits + right.visits,
    devices: left.devices + right.devices,
  };
}

function combineDaily(left, right) {
  const days = new Map();
  for (const row of [...left, ...right]) {
    const current = days.get(row.day) ?? { day: row.day, visits: 0, devices: 0 };
    current.visits += row.visits;
    current.devices += row.devices;
    days.set(row.day, current);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function sourceResult(value) {
  if (value instanceof Error) return { status: "error", error: value.message || String(value) };
  return { status: "ok", summary: value };
}

export function combinePortfolioSummaries(input) {
  const sources = Object.fromEntries(SOURCE_NAMES.map((name) => [name, sourceResult(input[name])]));
  const healthy = SOURCE_NAMES.every((name) => sources[name].status === "ok");
  if (!healthy) return { status: "partial", combined: null, sources };

  const mainland = sources.mainland.summary;
  const overseas = sources.overseas.summary;
  const combined = {
    generatedAt: Math.max(mainland.generatedAt, overseas.generatedAt),
    today: addPeriod(mainland.today, overseas.today),
    last7Days: addPeriod(mainland.last7Days, overseas.last7Days),
    last30Days: addPeriod(mainland.last30Days, overseas.last30Days),
    daily: combineDaily(mainland.daily, overseas.daily),
    latestVisitAt: Math.max(mainland.latestVisitAt ?? 0, overseas.latestVisitAt ?? 0) || null,
  };
  return { status: "complete", combined, sources };
}

export function validatePortfolioSummary(summary, expectedSource) {
  if (!summary || summary.source !== expectedSource || !Number.isFinite(summary.generatedAt)) {
    throw new Error(`${expectedSource} 返回了无效汇总`);
  }
  for (const period of PERIOD_NAMES) {
    if (!Number.isFinite(summary[period]?.visits) || !Number.isFinite(summary[period]?.devices)) {
      throw new Error(`${expectedSource} 缺少 ${period} 访问数据`);
    }
  }
  if (!Array.isArray(summary.daily)) throw new Error(`${expectedSource} 缺少每日趋势`);
  return summary;
}
