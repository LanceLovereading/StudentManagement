import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession, assertStudentVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { writeCaiwu } from "@/lib/ledger";

// 退款：order → REFUNDED + caiwu 反向条目（REFUND, ref=order:<id>:refund）。不删不改任何历史。
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { id } = await params;
    const order = await db.order.findUnique({ where: { id: Number(id) }, include: { user: { select: { ownerAdminId: true } } } });
    if (!order) throw new RuleError("NOT_FOUND", "订单不存在");
    if (admin.level !== "SENIOR" && order.user.ownerAdminId !== admin.id) throw new Error("FORBIDDEN");
    if (order.status !== "PAID") throw new RuleError("ORDER_STATE", `订单状态为 ${order.status}，不可退款`);

    const balanceAfter = await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
      return writeCaiwu(tx, { userId: order.userId, delta: -order.hours, reason: "REFUND", ref: `order:${order.id}:refund`, byAdminId: admin.id });
    });
    return NextResponse.json({ ok: true, balanceAfter });
  } catch (e) {
    return errorResponse(e);
  }
}
