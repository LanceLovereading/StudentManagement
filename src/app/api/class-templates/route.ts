import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

// 班级模板：可从现有班一键沉淀（classId），或直接给字段。仅 senior。
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    if (admin.level !== "SENIOR") throw new Error("FORBIDDEN");
    const { classId } = (await req.json()) as { classId?: number };
    if (!classId) throw new RuleError("BAD_REQUEST", "缺少班级 id");
    const cls = await db.class.findUnique({ where: { id: classId } });
    if (!cls) throw new RuleError("NOT_FOUND", "班级不存在");
    const row = await db.classTemplate.create({
      data: {
        name: cls.name, subject: cls.subject, yearLevel: cls.yearLevel, teacherId: cls.teacherId,
        weekday: cls.weekday, startMin: cls.startMin, endMin: cls.endMin, capacity: cls.capacity,
      },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    return errorResponse(e);
  }
}
