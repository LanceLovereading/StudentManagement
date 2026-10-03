const STATUS_LABEL: Record<string, string> = {
  new: "新录入",
  tried: "试听待转化",
  subscribed: "在读",
  ending: "课时将尽",
  churning: "已流失",
};

const VOUCHER_LABEL: Record<string, string> = {
  ISSUED: "已发放",
  REDEEMED: "已约课",
  ATTENDED: "已试听",
  CONVERTED: "已转化",
  NOSHOW: "缺席作废",
  EXPIRED: "已过期",
  USED: "已使用",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = status === "subscribed" ? "ok" : status === "ending" ? "warn" : status === "churning" ? "bad" : "gray";
  return <span className={`badge ${cls}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function VoucherBadge({ status }: { status: string }) {
  const cls = status === "CONVERTED" ? "ok" : status === "ATTENDED" ? "warn" : status === "REDEEMED" ? "" : "gray";
  return <span className={`badge ${cls}`}>{VOUCHER_LABEL[status] ?? status}</span>;
}

export function fmtDateTime(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Australia/Melbourne", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(dt);
}
