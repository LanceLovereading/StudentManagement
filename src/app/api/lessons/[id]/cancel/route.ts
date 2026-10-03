import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

// 取消课节（学校原因，如老师请假）：lesson → CANCELLED，不产生任何扣减——课时自然保留（R5）。
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { id } = await params;
    const lesson = await db.lesson.findUnique({ where: { id: Number(id) } });
    if (!lesson) throw new RuleError("NOT_FOUND", "课节不存在");
    if (lesson.status !== "SCHEDULED") throw new RuleError("LESSON_STATE", `课节状态为 ${lesson.status}，不可取消`);
    await db.lesson.update({ where: { id: lesson.id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
