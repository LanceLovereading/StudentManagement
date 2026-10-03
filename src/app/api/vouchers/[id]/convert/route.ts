import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getAdminSession, assertVoucherVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { writeCaiwu } from "@/lib/ledger";
import { checkEnroll } from "@/lib/rules";

// 转化（R10）：充值入账 + 正式排班同事务；ref 唯一防重复入账，券状态守卫防重复转化。
// 学生 → subscribed；若试听就约在该班，删除该券的单节占位（周循环占用由 student_time 表达，避免同节双计）。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { id } = await params;
    const { hours, classId } = (await req.json()) as { hours?: number; classId?: number };
    if (!hours || !Number.isInteger(hours) || hours < 1) throw new RuleError("BAD_REQUEST", "课时数必须是正整数");
    if (!classId) throw new RuleError("BAD_REQUEST", "缺少班级");

    const voucher = await assertVoucherVisible(admin, Number(id));
    if (voucher.kind !== "TRIAL" || voucher.status !== "ATTENDED") {
      throw new RuleError("R10_GUARD", `该券当前状态为 ${voucher.status}，不可转化`);
    }
    if (voucher.user.status !== "tried") {
      throw new RuleError("R10_GUARD", `学生状态为 ${voucher.user.status}，不在试听待转化状态`);
    }

    await db.$transaction(async (tx) => {
      await writeCaiwu(tx, {
        userId: voucher.userId,
        delta: hours,
        reason: "PURCHASE",
        ref: `manual:${randomUUID()}`,
        byAdminId: admin.id,
      });
      await checkEnroll(tx, voucher.userId, classId); // R1 / R3（读事务内新余额）/ R7
      await tx.studentTime.create({ data: { userId: voucher.userId, classId, status: "ACTIVE" } });
      await tx.voucher.update({ where: { id: voucher.id }, data: { status: "CONVERTED" } });
      await tx.orderLesson.deleteMany({
        where: { voucherId: voucher.id, lesson: { classId } },
      });
      await tx.user.update({
        where: { id: voucher.userId },
        data: { status: "subscribed", statusChangedAt: new Date() },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
