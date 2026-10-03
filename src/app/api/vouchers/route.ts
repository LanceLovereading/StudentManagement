import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession, assertStudentVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

// 发试听券（TRIAL, 30 天）。R8：每学生同时仅一张未完结 TRIAL 券（不分科目）——
// 先查给友好报错，部分唯一索引 one_open_trial_per_user 兜底。
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { userId, subject } = (await req.json()) as { userId?: number; subject?: string };
    if (!userId || !subject) throw new RuleError("BAD_REQUEST", "缺少学生或科目");

    await assertStudentVisible(admin, userId);
    const open = await db.voucher.findFirst({
      where: { userId, kind: "TRIAL", status: { in: ["ISSUED", "REDEEMED"] } },
    });
    if (open) throw new RuleError("R8_DUP_TRIAL", "该学生已有一张未完结试听券，听完当前券后由 admin 再发");

    const voucher = await db.voucher.create({
      data: {
        userId,
        kind: "TRIAL",
        subject,
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
