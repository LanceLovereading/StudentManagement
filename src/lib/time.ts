// 全程使用 Melbourne 本地日期字符串 "YYYY-MM-DD"，不做时区换算。
// ISO 格式的字典序即时间序；weekday 计算在中国同一 UTC 锚点上做，不涉及时区偏移。

export function melbourneToday(): string {
  // en-CA 区域格式恰好是 YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=周日
  return js === 0 ? 7 : js; // 归一为 1=周一 … 7=周日
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// 某周循环班的下一次课日期（含当天）
export function nextOccurrence(weekday: number, from: string): string {
  const diff = (weekday - weekdayOf(from) + 7) % 7;
  return addDays(from, diff);
}

export function weekdayName(w: number): string {
  return ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"][w];
}

// 990 -> "16:30"
export function fmtMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// "2026-10-07" -> "10-07 周三"
export function fmtDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${m}-${d} ${weekdayName(weekdayOf(dateStr))}`;
}
