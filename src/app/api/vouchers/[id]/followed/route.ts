import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession, assertVoucherVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

// 标记已跟进：跟进队列退出的锚点（followedUpAt）。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { id } = await params;
    const voucher = await assertVoucherVisible(admin, Number(id));
    if (voucher.status !== "ATTENDED") throw new RuleError("VOUCHER_STATE", "仅已试听的券可标记跟进");
    await db.voucher.update({ where: { id: voucher.id }, data: { followedUpAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
