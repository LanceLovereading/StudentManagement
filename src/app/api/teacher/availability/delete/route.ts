import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTeacherSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const teacher = await getTeacherSession();
    if (!teacher) throw new Error("UNAUTHORIZED");
    const { id } = (await req.json()) as { id?: number };
    if (!id) throw new RuleError("BAD_REQUEST", "缺少时段 id");
    const row = await db.teacherTime.findUnique({ where: { id } });
    if (!row) throw new RuleError("NOT_FOUND", "时段不存在");
    if (row.teacherId !== teacher.id) throw new Error("FORBIDDEN");
    await db.teacherTime.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
