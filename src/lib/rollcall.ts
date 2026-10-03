import type { Prisma } from "@prisma/client";
import { RuleError } from "./errors";
import { writeCaiwu } from "./ledger";

type Tx = Prisma.TransactionClient;

export type RollcallEntry = { studentId: number; present: boolean; feedback?: string };
export type RollcallOutcome = { studentId: number; ok: boolean; type?: string; code?: string; message?: string };

// 点名分发（R11 口径）：
// - 在读学生：出勤照扣（缺勤也照扣——那节课老师已教），caiwu(−1, ATTENDANCE, ref=lesson:<id>)
// - 补课学生（RESCHEDULE 券）：同样照扣，券 → USED；补课券不是免扣凭证
// - 试听学生（TRIAL 券）：免费，出勤 = 券 REDEEMED→ATTENDED（new→tried）；缺席 = 券 NOSHOW（作废可重发）
// 逐条独立执行：一个学生余额穿透（R4）不影响其他学生的点名。
export async function dispatchAttendance(
  tx: Tx,
  lessonId: number,
  classId: number,
  entry: RollcallEntry,
  byTeacherId: number
): Promise<RollcallOutcome> {
  const { studentId, present } = entry;
  const status = present ? "PRESENT" : "NOSHOW";
  try {
    const booking = await tx.orderLesson.findFirst({
      where: { lessonId, studentId },
      include: { voucher: true },
    });
    const voucher = booking?.voucher;

    if (voucher?.kind === "TRIAL" || voucher?.kind === "RESCHEDULE") {
      if (voucher.status !== "REDEEMED") return { studentId, ok: true, type: "already" };
      if (voucher.kind === "TRIAL") {
        await tx.voucher.update({ where: { id: voucher.id }, data: { status: present ? "ATTENDED" : "NOSHOW" } });
        if (present) {
          const u = await tx.user.findUniqueOrThrow({ where: { id: studentId }, select: { status: true } });
          if (u.status === "new") {
            await tx.user.update({ where: { id: studentId }, data: { status: "tried", statusChangedAt: new Date() } });
          }
        }
        return { studentId, ok: true, type: "trial" };
      }
      // RESCHEDULE：照扣 + 券用掉
      await writeCaiwu(tx, { userId: studentId, delta: -1, reason: "ATTENDANCE", status, ref: `lesson:${lessonId}`, byTeacherId });
      await tx.voucher.update({ where: { id: voucher.id }, data: { status: "USED" } });
      return { studentId, ok: true, type: "makeup" };
    }

    const st = await tx.studentTime.findFirst({ where: { userId: studentId, classId, status: "ACTIVE" } });
    if (!st) return { studentId, ok: false, code: "NOT_ENROLLED", message: "不在这节课名单上" };
    const existing = await tx.caiwu.findUnique({
      where: { reason_userId_ref: { reason: "ATTENDANCE", userId: studentId, ref: `lesson:${lessonId}` } },
    });
    if (existing) return { studentId, ok: true, type: "already" };
    await writeCaiwu(tx, { userId: studentId, delta: -1, reason: "ATTENDANCE", status, ref: `lesson:${lessonId}`, byTeacherId });
    return { studentId, ok: true, type: "regular" };
  } catch (e) {
    if (e instanceof RuleError) return { studentId, ok: false, code: e.code, message: e.message };
    throw e;
  }
}
