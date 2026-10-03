import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";
import { RuleError } from "./errors";

export const ENDING_THRESHOLD = 4; // 余额 ≤ 4 进续费队列（一个月 buffer，可配置假设值）
export const CHURN_DAYS = 14; // ending 且余额 0 持续 14 天 → churning

export type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

// 记一笔账：balance_after 快照 + 生命周期重算。必须在事务里调用；
// 幂等锚是 DB 的 unique(reason, userId, ref)——同一事件最多记一笔（R4）。
export async function writeCaiwu(
  tx: Tx,
  input: { userId: number; delta: number; reason: string; status?: string; ref: string; byAdminId: number }
) {
  const last = await tx.caiwu.findFirst({ where: { userId: input.userId }, orderBy: { id: "desc" }, select: { balanceAfter: true } });
  const balanceAfter = (last?.balanceAfter ?? 0) + input.delta;
  if (balanceAfter < 0) throw new RuleError("R4_OVERDRAFT", "余额不足：扣减不能穿透为零以下");
  await tx.caiwu.create({ data: { ...input, status: input.status ?? null, balanceAfter } });
  await recomputeLifecycle(tx, input.userId, balanceAfter);
  return balanceAfter;
}

// 余额驱动的状态重算（R14 的事件迁移部分）。new/tried 不受余额影响；
// churning 的判定（0 持续 14 天）在每日扫描里，这里只管充值复活的方向。
export async function recomputeLifecycle(tx: Tx, userId: number, balance: number) {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true } });
  if (u.status !== "subscribed" && u.status !== "ending" && u.status !== "churning") return;
  const next = balance > ENDING_THRESHOLD ? "subscribed" : "ending";
  if (next !== u.status) {
    await tx.user.update({ where: { id: userId }, data: { status: next, statusChangedAt: new Date() } });
  }
}

export async function getBalance(client: Db, userId: number): Promise<number> {
  const last = await client.caiwu.findFirst({ where: { userId }, orderBy: { id: "desc" }, select: { balanceAfter: true } });
  return last?.balanceAfter ?? 0;
}
