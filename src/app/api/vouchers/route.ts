import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession, assertStudentVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

// 发券：TRIAL（试听，R8 每学生同时仅一张未完结，30 天）或 RESCHEDULE（补课预约权，可跨班兑一节，R11）。
// 部分唯一索引 one_open_trial_per_user 兜底 R8。
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { userId, subject, kind } = (await req.json()) as { userId?: number; subject?: string; kind?: string };
    const voucherKind = kind === "RESCHEDULE" ? "RESCHEDULE" : "TRIAL";
    if (!userId) throw new RuleError("BAD_REQUEST", "缺少学生");
    if (voucherKind === "TRIAL" && !subject) throw new RuleError("BAD_REQUEST", "试听券需要科目");

    await assertStudentVisible(admin, userId);
    if (voucherKind === "TRIAL") {
      const open = await db.voucher.findFirst({
        where: { userId, kind: "TRIAL", status: { in: ["ISSUED", "REDEEMED"] } },
      });
      if (open) throw new RuleError("R8_DUP_TRIAL", "该学生已有一张未完结试听券，听完当前券后由 admin 再发");
    }

    const voucher = await db.voucher.create({
      data: {
        userId,
        kind: voucherKind,
        subject: voucherKind === "TRIAL" ? subject : null,
        status: "ISSUED",
        validUntil: new Date(Date.now() + 30 * 864e5),
        issuedBy: admin.id,
      },
    });
    return NextResponse.json({ ok: true, id: voucher.id });
  } catch (e) {
    return errorResponse(e);
  }
}
