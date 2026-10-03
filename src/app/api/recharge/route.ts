import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getAdminSession, assertStudentVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { writeCaiwu } from "@/lib/ledger";

// 手工充值（v1 收款线下）：admin 记账写 caiwu(+N, PURCHASE)。
// 余额变化驱动状态复活（ending/churning → subscribed/ending，R14）。
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { userId, hours } = (await req.json()) as { userId?: number; hours?: number };
    if (!userId || !hours || !Number.isInteger(hours) || hours < 1) throw new RuleError("BAD_REQUEST", "课时数必须是正整数");
    await assertStudentVisible(admin, userId);

    const balanceAfter = await db.$transaction((tx) =>
      writeCaiwu(tx, {
        userId,
        delta: hours,
        reason: "PURCHASE",
        ref: `manual:${randomUUID()}`,
        byAdminId: admin.id,
      })
    );
    return NextResponse.json({ ok: true, balanceAfter });
  } catch (e) {
    return errorResponse(e);
  }
}
