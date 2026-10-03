import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTeacherSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

// 教师自助登记每周可用时段。R12a：同一教师的可用时段不得互相重叠（int 比较）。
export async function POST(req: NextRequest) {
  try {
    const teacher = await getTeacherSession();
    if (!teacher) throw new Error("UNAUTHORIZED");
    const { weekday, startMin, endMin } = (await req.json()) as { weekday?: number; startMin?: number; endMin?: number };
    if (!weekday || weekday < 1 || weekday > 7) throw new RuleError("BAD_REQUEST", "周几无效");
    if (startMin == null || endMin == null || startMin < 0 || endMin > 1440 || startMin >= endMin) {
      throw new RuleError("BAD_REQUEST", "时段无效");
    }
    const existing = await db.teacherTime.findMany({ where: { teacherId: teacher.id, weekday } });
    for (const w of existing) {
      if (startMin < w.endMin && endMin > w.startMin) {
        throw new RuleError("R12_OVERLAP", "与已登记的可用时段重叠");
      }
    }
    const row = await db.teacherTime.create({ data: { teacherId: teacher.id, weekday, startMin, endMin } });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    return errorResponse(e);
  }
}
