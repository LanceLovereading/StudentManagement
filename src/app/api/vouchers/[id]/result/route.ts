import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession, assertVoucherVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

// 标记试听结果：ATTENDED → 学生 new→tried（R14 事件迁移，跟进队列的入口）；
// NOSHOW → 券作废可重发，学生状态不变。试听免费：不写 caiwu。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { id } = await params;
    const { outcome, note } = (await req.json()) as { outcome?: string; note?: string };
    if (outcome !== "ATTENDED" && outcome !== "NOSHOW") throw new RuleError("BAD_REQUEST", "结果必须是 ATTENDED 或 NOSHOW");

    const voucher = await assertVoucherVisible(admin, Number(id));
    if (voucher.status !== "REDEEMED") throw new RuleError("VOUCHER_STATE", `该券当前状态为 ${voucher.status}，不可标记结果`);

    await db.$transaction(async (tx) => {
      await tx.voucher.update({
        where: { id: voucher.id },
        data: { status: outcome, ...(note ? { outcomeNote: note } : {}) },
      });
      if (outcome === "ATTENDED" && voucher.user.status === "new") {
        await tx.user.update({
          where: { id: voucher.userId },
          data: { status: "tried", statusChangedAt: new Date() },
        });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
