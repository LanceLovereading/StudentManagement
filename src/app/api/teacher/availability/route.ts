import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTeacherSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { melbourneToday } from "@/lib/time";

// 教师自助登记可用时间：具体日期 + 时段（档期按天变动，不按周几循环）。
// R12a：同一教师同一天的可用时段不得互相重叠（int 比较）；过去日期不可登记。
export async function POST(req: NextRequest) {
  try {
    const teacher = await getTeacherSession();
    if (!teacher) throw new Error("UNAUTHORIZED");
    const { date, startMin, endMin } = (await req.json()) as { date?: string; startMin?: number; endMin?: number };
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RuleError("BAD_REQUEST", "日期无效");
    if (date < melbourneToday()) throw new RuleError("BAD_REQUEST", "不能登记过去的日期");
    if (startMin == null || endMin == null || startMin < 0 || endMin > 1440 || startMin >= endMin) {
      throw new RuleError("BAD_REQUEST", "时段无效");
    }
    const existing = await db.teacherTime.findMany({ where: { teacherId: teacher.id, date } });
    for (const w of existing) {
      if (startMin < w.endMin && endMin > w.startMin) {
        throw new RuleError("R12_OVERLAP", `${date} 已有重叠的可用时段（${w.startMin}-${w.endMin}）`);
      }
    }
    const row = await db.teacherTime.create({ data: { teacherId: teacher.id, date, startMin, endMin } });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    return errorResponse(e);
  }
}
