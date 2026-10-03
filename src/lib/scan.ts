import { db } from "./db";
import { ENDING_THRESHOLD, CHURN_DAYS } from "./ledger";
import { melbourneToday, nextOccurrence } from "./time";

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

  // 物化各班下一节（"查看时补建"的兜底）：教师点名页/兑换预览/学生端都有稳定可链接的课节
  // 学期结束的班不再物化——lesson 只存在于 [startDate, endDate] 内
  const openClasses = await db.class.findMany({ where: { status: "OPEN" }, select: { id: true, weekday: true, endDate: true } });
  const today = melbourneToday();
  for (const c of openClasses) {
    const date = nextOccurrence(c.weekday, today);
    if (date > c.endDate) continue;
    await db.lesson.upsert({
      where: { classId_date: { classId: c.id, date } },
      create: { classId: c.id, date, status: "SCHEDULED" },
      update: {},
    });
  }

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

const FOLLOWED_VISIBLE_DAYS = 7; // 标记跟进后条目不消失：近 7 天内弱化保留，之后自然出队

// 跟进队列：试听过、未转化；未跟进的排前，近 7 天内已跟进的弱化保留（留痕）。scope 是 R6 的行级过滤。
export async function getFollowupQueue(scope: { ownerAdminId?: number }) {
  const since = new Date(Date.now() - FOLLOWED_VISIBLE_DAYS * 864e5);
  const vMatch = { kind: "TRIAL" as const, status: "ATTENDED" as const, OR: [{ followedUpAt: null }, { followedUpAt: { gte: since } }] };
  const rows = await db.user.findMany({
    where: { status: "tried", ...scope, vouchers: { some: vMatch } },
    include: { vouchers: { where: vMatch, orderBy: { followedUpAt: "desc" } }, ownerAdmin: { select: { name: true } } },
    orderBy: { statusChangedAt: "asc" },
  });
  return rows
    .map((u) => {
      // 重试听的学生可能同时有已跟进旧券和未跟进新券：未跟进的是主条目
      const v = u.vouchers.find((x) => !x.followedUpAt) ?? u.vouchers[0];
      const hours = (Date.now() - u.statusChangedAt.getTime()) / 36e5;
      return {
        user: u, voucher: v,
        overdue: !v.followedUpAt && hours > FOLLOWUP_HOURS,
        waitHours: Math.floor(hours),
        followedAt: v.followedUpAt as Date | null,
      };
    })
    .sort((a, b) => Number(!!a.followedAt) - Number(!!b.followedAt));
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
