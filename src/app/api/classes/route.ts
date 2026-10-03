import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { checkClassCreate } from "@/lib/rules";

// 建班（排课）。仅 senior——R6 下班级管理超出 junior 范围。
// 两种入口：从零建班（全字段 + 学期日期），或 templateId + 学期日期（新学期从模板开班）。
// 服务端强制：时间与学期日期合法 + R2（教师不撞班）+ R12b（学期内未来 4 节教师有可用窗）。
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    if (admin.level !== "SENIOR") throw new Error("FORBIDDEN");
    const body = (await req.json()) as {
      name?: string; subject?: string; yearLevel?: number; teacherId?: number;
      weekday?: number; startMin?: number; endMin?: number; capacity?: number;
      startDate?: string; endDate?: string; templateId?: number;
    };

    let base = {
      name: body.name, subject: body.subject, yearLevel: body.yearLevel, teacherId: body.teacherId,
      weekday: body.weekday, startMin: body.startMin, endMin: body.endMin, capacity: body.capacity,
    };
    if (body.templateId) {
      const tpl = await db.classTemplate.findUnique({ where: { id: body.templateId } });
      if (!tpl) throw new RuleError("NOT_FOUND", "模板不存在");
      base = {
        name: tpl.name, subject: tpl.subject, yearLevel: tpl.yearLevel, teacherId: tpl.teacherId,
        weekday: tpl.weekday, startMin: tpl.startMin, endMin: tpl.endMin, capacity: tpl.capacity,
      };
    }

    const { startDate, endDate } = body;
    if (!base.name || !base.subject || !base.teacherId || !base.weekday || base.weekday < 1 || base.weekday > 7) {
      throw new RuleError("BAD_REQUEST", "班级名、科目、教师、周几必填");
    }
    if (!base.yearLevel || base.yearLevel < 1 || base.yearLevel > 12) throw new RuleError("BAD_REQUEST", "年级无效");
    if (!base.capacity || base.capacity < 1) throw new RuleError("BAD_REQUEST", "容量无效");
    if (base.startMin == null || base.endMin == null) throw new RuleError("BAD_REQUEST", "缺少上课时间");
    if (!startDate || !endDate) throw new RuleError("BAD_REQUEST", "缺少学期起止日期");

    await checkClassCreate(db, { teacherId: base.teacherId, weekday: base.weekday, startMin: base.startMin, endMin: base.endMin, startDate, endDate });

    const cls = await db.class.create({
      data: { name: base.name, subject: base.subject, yearLevel: base.yearLevel, teacherId: base.teacherId, weekday: base.weekday, startMin: base.startMin, endMin: base.endMin, capacity: base.capacity, startDate, endDate },
    });
    return NextResponse.json({ ok: true, id: cls.id });
  } catch (e) {
    return errorResponse(e);
  }
}
