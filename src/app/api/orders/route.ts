import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession, assertStudentVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

// 创建订单（交易事实）。收款在线下：创建时 status=CREATED，收到钱后「标记已收款」→ PAID 同事务入账。
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { userId, hours, amountYuan, subject } = (await req.json()) as {
      userId?: number; hours?: number; amountYuan?: number; subject?: string;
    };
    if (!userId || !hours || !Number.isInteger(hours) || hours < 1) throw new RuleError("BAD_REQUEST", "课时数必须是正整数");
    if (!amountYuan || amountYuan <= 0) throw new RuleError("BAD_REQUEST", "金额无效");
    await assertStudentVisible(admin, userId);

    const order = await db.order.create({
      data: {
        userId,
        subject: subject ?? null,
        hours,
        amountCents: Math.round(amountYuan * 100),
        status: "CREATED",
        createdByAdminId: admin.id,
      },
    });
    return NextResponse.json({ ok: true, id: order.id });
  } catch (e) {
    return errorResponse(e);
  }
}
