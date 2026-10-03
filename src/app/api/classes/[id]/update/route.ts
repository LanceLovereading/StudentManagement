import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { checkClassEdit } from "@/lib/rules";

// 调班：改时间/换老师/调容量。校验 = 建班三条 + 改时间后在读学生不撞班（R1）+ 容量不低于现有占用。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    if (admin.level !== "SENIOR") throw new Error("FORBIDDEN");
    const { id } = await params;
    const { name, subject, yearLevel, teacherId, weekday, startMin, endMin, capacity, startDate, endDate } = (await req.json()) as {
      name?: string; subject?: string; yearLevel?: number; teacherId?: number;
      weekday?: number; startMin?: number; endMin?: number; capacity?: number;
      startDate?: string; endDate?: string;
    };
    const current = await db.class.findUnique({ where: { id: Number(id) } });
    if (!current) throw new RuleError("NOT_FOUND", "班级不存在");
    if (!name || !subject || !teacherId || !weekday || weekday < 1 || weekday > 7) {
      throw new RuleError("BAD_REQUEST", "班级名、科目、教师、周几必填");
    }
    if (!yearLevel || yearLevel < 1 || yearLevel > 12) throw new RuleError("BAD_REQUEST", "年级无效");
    if (!capacity || capacity < 1) throw new RuleError("BAD_REQUEST", "容量无效");
    if (startMin == null || endMin == null) throw new RuleError("BAD_REQUEST", "缺少上课时间");
    if (!startDate || !endDate) throw new RuleError("BAD_REQUEST", "缺少学期起止日期");

    const next = { teacherId, weekday, startMin, endMin, startDate, endDate, capacity };
    await checkClassEdit(db, current.id, next, current);

    await db.class.update({
      where: { id: current.id },
      data: { name, subject, yearLevel, teacherId, weekday, startMin, endMin, capacity, startDate, endDate },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
