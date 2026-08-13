const $ = (id) => document.getElementById(id);
const format = (period) => `${period.confirmed} 次成功 · ${period.unconfirmed} 次未确认`;
const dateTime = (seconds) => seconds ? new Date(seconds * 1000).toLocaleString("zh-CN", { hour12: false }) : "暂无";
const chinaDayKey = (date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(date);

function render(data) {
  $("today-devices").textContent = data.today.devices;
  $("week-devices").textContent = data.last7Days.devices;
  $("month-devices").textContent = data.last30Days.devices;
  $("today-detail").textContent = format(data.today);
  $("week-detail").textContent = format(data.last7Days);
  $("month-detail").textContent = format(data.last30Days);
  const total = data.last30Days.confirmed + data.last30Days.unconfirmed;
  $("success-rate").textContent = total ? `${Math.round(data.last30Days.confirmed / total * 100)}%` : "—";
  $("latest").textContent = `最近成功：${dateTime(data.latestConfirmedAt)}`;
  $("updated").textContent = `更新于 ${dateTime(data.generatedAt)}`;
  $("status").textContent = "线上汇总读取成功";
  document.querySelector(".status").classList.remove("error");

  const rows = new Map(data.daily.map((row) => [row.day, row]));
  const days = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(); day.setDate(day.getDate() - 29 + index);
    const key = chinaDayKey(day);
    return rows.get(key) ?? { day: key, confirmed: 0, unconfirmed: 0 };
  });
  const max = Math.max(1, ...days.flatMap((day) => [day.confirmed, day.unconfirmed]));
  $("chart").innerHTML = days.map((day, index) => `<div class="bar-day" title="${day.day}：${day.confirmed} 成功，${day.unconfirmed} 未确认"><i class="bar" style="height:${day.confirmed / max * 100}%"></i><i class="bar unconfirmed" style="height:${day.unconfirmed / max * 100}%"></i>${index % 5 === 0 || index === 29 ? `<span>${day.day.slice(5)}</span>` : ""}</div>`).join("");
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
