import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getAdminSession, assertStudentVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { writeCaiwu } from "@/lib/ledger";

// 赠送课时（GRANT）：admin 的自主营销/服务补救动作，与充值同源入账，对账口径统一。
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { userId, hours } = (await req.json()) as { userId?: number; hours?: number };
    if (!userId || !hours || !Number.isInteger(hours) || hours < 1) throw new RuleError("BAD_REQUEST", "课时数必须是正整数");
    await assertStudentVisible(admin, userId);

    const balanceAfter = await db.$transaction((tx) =>
      writeCaiwu(tx, { userId, delta: hours, reason: "GRANT", ref: `manual:${randomUUID()}`, byAdminId: admin.id })
    );
    return NextResponse.json({ ok: true, balanceAfter });
  } catch (e) {
    return errorResponse(e);
  }
}
