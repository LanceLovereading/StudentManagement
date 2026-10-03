import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

// 停开/重开班级。停开后：checkEnroll / checkSingleRedeem 均拒绝（CLASS_CLOSED），
// 在读学生与已排课节不受影响。仅 senior。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    if (admin.level !== "SENIOR") throw new Error("FORBIDDEN");
    const { id } = await params;
    const { status } = (await req.json()) as { status?: string };
    if (status !== "OPEN" && status !== "CLOSED") throw new RuleError("BAD_REQUEST", "状态必须是 OPEN 或 CLOSED");
    const cls = await db.class.findUnique({ where: { id: Number(id) } });
    if (!cls) throw new RuleError("NOT_FOUND", "班级不存在");
    await db.class.update({ where: { id: cls.id }, data: { status } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
