import { db } from "./db";
import { ENDING_THRESHOLD, CHURN_DAYS } from "./ledger";

export const FOLLOWUP_HOURS = 48; // tried 超 48h 标"超时"（可配置假设值）；提示本身在试听结束即出现

// 每日扫描（R14）：幂等，工作台每次加载执行。替代任何 cron 依赖；生产可换 cron 调同一个函数。
// 1) R9：ISSUED 券过有效期 → EXPIRED
// 2) 生命周期迁移：subscribed/ending/churning 按余额与时间推进
// 队列本身是查询（getQueues）——没有 todo 表，"该联系谁"是状态的函数。
export async function runDailyScan() {
  await db.voucher.updateMany({
    where: { status: "ISSUED", validUntil: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });

  const users = await db.user.findMany({
    select: {
      id: true, status: true, statusChangedAt: true,
      caiwu: { orderBy: { id: "desc" }, take: 1, select: { balanceAfter: true } },
    },
  });
  const now = Date.now();
  for (const u of users) {
    const bal = u.caiwu[0]?.balanceAfter ?? 0;
    let next: string | null = null;
    if (u.status === "subscribed" && bal <= ENDING_THRESHOLD) next = "ending";
    else if (u.status === "ending" && bal > ENDING_THRESHOLD) next = "subscribed";
    else if (u.status === "ending" && bal === 0 && now - u.statusChangedAt.getTime() > CHURN_DAYS * 864e5) next = "churning";
    else if (u.status === "churning" && bal > ENDING_THRESHOLD) next = "subscribed";
    else if (u.status === "churning" && bal > 0) next = "ending";
    if (next) await db.user.update({ where: { id: u.id }, data: { status: next, statusChangedAt: new Date() } });
  }
}

export type QueueUser = {
  id: number;
  name: string;
  phone: string;
  ownerAdmin: { name: string };
  statusChangedAt: Date;
};

// 跟进队列：试听过、未转化、未标记已跟进。scope 是 R6 的行级过滤。
export async function getFollowupQueue(scope: { ownerAdminId?: number }) {
  const rows = await db.user.findMany({
    where: { status: "tried", ...scope, vouchers: { some: { kind: "TRIAL", status: "ATTENDED", followedUpAt: null } } },
    include: { vouchers: { where: { kind: "TRIAL", status: "ATTENDED", followedUpAt: null }, orderBy: { id: "desc" } }, ownerAdmin: { select: { name: true } } },
    orderBy: { statusChangedAt: "asc" },
  });
  return rows.map((u) => {
    const v = u.vouchers[0];
    const hours = (Date.now() - u.statusChangedAt.getTime()) / 36e5;
    return { user: u, voucher: v, overdue: hours > FOLLOWUP_HOURS, waitHours: Math.floor(hours) };
  });
}

// 续费队列：ending（余额 ≤ 4），按"先见底先谈"排序
export async function getRenewalQueue(scope: { ownerAdminId?: number }) {
  return db.user.findMany({
    where: { status: "ending", ...scope },
    include: { caiwu: { orderBy: { id: "desc" }, take: 1 }, ownerAdmin: { select: { name: true } } },
    orderBy: { statusChangedAt: "asc" },
  });
}

// 唤醒队列：churning（余额 0 超 14 天，需要其他营销动作）
export async function getWakeupQueue(scope: { ownerAdminId?: number }) {
  return db.user.findMany({
    where: { status: "churning", ...scope },
    include: { ownerAdmin: { select: { name: true } } },
    orderBy: { statusChangedAt: "asc" },
  });
}
