import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession, assertVoucherVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { checkSingleRedeem } from "@/lib/rules";
import { melbourneToday, nextOccurrence } from "@/lib/time";

// 兑换试听券：R9 有效期 → R1 冲突 → R7 容量 → R13 物化 lesson + 写 order_lesson → 券 REDEEMED。
// 预告（兑换页）与裁决（这里）共用 checkSingleRedeem——界面预告即服务端裁决逻辑。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { id } = await params;
    const { classId } = (await req.json()) as { classId?: number };
    if (!classId) throw new RuleError("BAD_REQUEST", "缺少班级");

    const voucher = await assertVoucherVisible(admin, Number(id));
    if (voucher.kind !== "TRIAL") throw new RuleError("VOUCHER_STATE", "仅试听券可兑换");
    if (voucher.status !== "ISSUED") throw new RuleError("VOUCHER_STATE", `该券当前状态为 ${voucher.status}，不可兑换`);

    if (voucher.validUntil.getTime() < Date.now()) {
      await db.voucher.update({ where: { id: voucher.id }, data: { status: "EXPIRED" } });
      throw new RuleError("R9_EXPIRED", "券已过期，请由 admin 重发并留痕");
    }

    const cls = await db.class.findUniqueOrThrow({ where: { id: classId } });
    if (cls.subject !== voucher.subject) throw new RuleError("SUBJECT_MISMATCH", "科目不匹配");
    const date = nextOccurrence(cls.weekday, melbourneToday());

    const lessonId = await db.$transaction(async (tx) => {
      await checkSingleRedeem(tx, voucher.userId, cls, date);
      // R13 预约物化：目标 (class, date) 的 lesson 不存在 → 现场从周循环创建
      const lesson = await tx.lesson.upsert({
        where: { classId_date: { classId: cls.id, date } },
        create: { classId: cls.id, date, status: "SCHEDULED" },
        update: {},
      });
      await tx.orderLesson.create({ data: { lessonId: lesson.id, studentId: voucher.userId, voucherId: voucher.id } });
      await tx.voucher.update({ where: { id: voucher.id }, data: { status: "REDEEMED" } });
      return lesson.id;
    });

    return NextResponse.json({ ok: true, lessonId });
  } catch (e) {
    return errorResponse(e);
  }
}
