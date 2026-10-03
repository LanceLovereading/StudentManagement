import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { checkClassCreate } from "@/lib/rules";

// 建班（排课）。仅 senior——R6 下班级管理超出 junior 范围。
// 服务端强制：时间合法 + R2（教师不撞班）+ R12b（班时落在教师可用窗内）。
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    if (admin.level !== "SENIOR") throw new Error("FORBIDDEN");
    const { name, subject, yearLevel, teacherId, weekday, startMin, endMin, capacity } = (await req.json()) as {
      name?: string; subject?: string; yearLevel?: number; teacherId?: number;
      weekday?: number; startMin?: number; endMin?: number; capacity?: number;
    };
    if (!name || !subject || !teacherId || !weekday || weekday < 1 || weekday > 7) {
      throw new RuleError("BAD_REQUEST", "班级名、科目、教师、周几必填");
    }
    if (!yearLevel || yearLevel < 1 || yearLevel > 12) throw new RuleError("BAD_REQUEST", "年级无效");
    if (!capacity || capacity < 1) throw new RuleError("BAD_REQUEST", "容量无效");
    if (startMin == null || endMin == null) throw new RuleError("BAD_REQUEST", "缺少上课时间");

    await checkClassCreate(db, { teacherId, weekday, startMin, endMin });

    const cls = await db.class.create({
      data: { name, subject, yearLevel, teacherId, weekday, startMin, endMin, capacity },
    });
    return NextResponse.json({ ok: true, id: cls.id });
  } catch (e) {
    return errorResponse(e);
  }
}
