const $ = (id) => document.getElementById(id);
const format = (period) => `${period.devices} 个分站匿名设备`;
const dateTime = (seconds) => seconds ? new Date(seconds * 1000).toLocaleString("zh-CN", { hour12: false }) : "暂无";
const chinaDayKey = (date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(date);

function render(data) {
  for (const name of ["mainland", "overseas"]) renderSource(name, data.sources[name]);
  document.querySelector(".status").classList.toggle("error", data.status !== "complete");
  if (!data.combined) {
    for (const id of ["today-visits", "week-visits", "month-visits", "month-devices"]) $(id).textContent = "—";
    for (const id of ["today-detail", "week-detail", "month-detail"]) $(id).textContent = "合计暂不可用";
    $("latest").textContent = "最近访问：合计暂不可用";
    $("updated").textContent = "";
    $("status").textContent = "一个分站读取失败；合计暂不可用，健康分站仍显示在下方";
    $("chart").innerHTML = '<p class="empty">合计趋势暂不可用</p>';
    return;
  }
  const summary = data.combined;
  $("today-visits").textContent = summary.today.visits;
  $("week-visits").textContent = summary.last7Days.visits;
  $("month-visits").textContent = summary.last30Days.visits;
  $("month-devices").textContent = summary.last30Days.devices;
  $("today-detail").textContent = format(summary.today);
  $("week-detail").textContent = format(summary.last7Days);
  $("month-detail").textContent = format(summary.last30Days);
  $("latest").textContent = `最近访问：${dateTime(summary.latestVisitAt)}`;
  $("updated").textContent = `更新于 ${dateTime(summary.generatedAt)}`;
  $("status").textContent = "大陆站与海外站汇总成功";

  const rows = new Map(summary.daily.map((row) => [row.day, row]));
  const days = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(); day.setDate(day.getDate() - 29 + index);
    const key = chinaDayKey(day);
    return rows.get(key) ?? { day: key, visits: 0, devices: 0 };
  });
  const max = Math.max(1, ...days.map((day) => day.visits));
  $("chart").innerHTML = days.map((day, index) => `<div class="bar-day" title="${day.day}：${day.visits} 次访问"><i class="bar" style="height:${day.visits / max * 100}%"></i>${index % 5 === 0 || index === 29 ? `<span>${day.day.slice(5)}</span>` : ""}</div>`).join("");
}

function renderSource(name, result) {
  const card = $(`source-${name}`);
  card.classList.toggle("error", result.status !== "ok");
  if (result.status !== "ok") {
    card.querySelector(".source-status").textContent = `读取失败：${result.error}`;
    card.querySelector("dl").innerHTML = "";
    card.querySelector("small").textContent = "";
    return;
  }
  const summary = result.summary;
  card.querySelector(".source-status").textContent = "正常";
  card.querySelector("dl").innerHTML = `<div><dt>今天</dt><dd>${summary.today.visits} 次</dd></div><div><dt>近 7 天</dt><dd>${summary.last7Days.visits} 次</dd></div><div><dt>近 30 天</dt><dd>${summary.last30Days.visits} 次</dd></div>`;
  card.querySelector("small").textContent = `当前保留数据起始：${dateTime(summary.trackingStartedAt)} · 最近访问：${dateTime(summary.latestVisitAt)}`;
}

async function refresh() {
  try {
    $("status").textContent = "正在读取线上汇总…";
    const response = await fetch("/api/summary", { cache: "no-store" });
    if (!response.ok) throw new Error(await response.text());
    render(await response.json());
  } catch (error) {
    document.querySelector(".status").classList.add("error");
    $("status").textContent = `读取失败：${error.message || error}`;
  }
}

$("refresh").addEventListener("click", refresh);
void refresh();
setInterval(refresh, 60_000);
