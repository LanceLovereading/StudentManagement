import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession, assertStudentVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { writeCaiwu } from "@/lib/ledger";

// 标记已收款：order → PAID，同事务写 caiwu(+hours, PURCHASE, ref=order:<id>)。
// ref 唯一锚保证一张订单只入账一次（幂等重放被 P2002/R10 守卫拦下）。
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { id } = await params;
    const order = await db.order.findUnique({ where: { id: Number(id) }, include: { user: { select: { ownerAdminId: true } } } });
    if (!order) throw new RuleError("NOT_FOUND", "订单不存在");
    if (admin.level !== "SENIOR" && order.user.ownerAdminId !== admin.id) throw new Error("FORBIDDEN");
    if (order.status !== "CREATED") throw new RuleError("ORDER_STATE", `订单状态为 ${order.status}，不可收款`);

    const balanceAfter = await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID", paidAt: new Date() } });
      return writeCaiwu(tx, { userId: order.userId, delta: order.hours, reason: "PURCHASE", ref: `order:${order.id}`, byAdminId: admin.id });
    });
    return NextResponse.json({ ok: true, balanceAfter });
  } catch (e) {
    return errorResponse(e);
  }
}
