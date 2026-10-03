import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTeacherSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { dispatchAttendance } from "@/lib/rollcall";
import { melbourneToday } from "@/lib/time";

// 点名提交：逐学生分发（在读/补课照扣、试听走券状态），逐条留课堂反馈，课节 → DONE。
// 幂等：已标记的学生返回 type=already，不重复扣减（R4 锚 + 券状态守卫）。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teacher = await getTeacherSession();
    if (!teacher) throw new Error("UNAUTHORIZED");
    const { id } = await params;
    const { entries } = (await req.json()) as {
      entries?: { studentId: number; present: boolean; feedback?: string }[];
    };
    if (!entries || !Array.isArray(entries)) throw new RuleError("BAD_REQUEST", "缺少点名条目");

    const lesson = await db.lesson.findUnique({
      where: { id: Number(id) },
      include: { class: { select: { id: true, teacherId: true, name: true } } },
    });
    if (!lesson) throw new RuleError("NOT_FOUND", "课节不存在");
    if (lesson.class.teacherId !== teacher.id) throw new Error("FORBIDDEN");
    if (lesson.status !== "SCHEDULED") throw new RuleError("LESSON_STATE", `课节状态为 ${lesson.status}，不可点名`);
    if (lesson.date > melbourneToday()) {
      // 课还没上，不可提前点名。演示需要时由 seed 把课节日期铺在过去/当天。
      throw new RuleError("LESSON_STATE", "课还未到上课日期，不可提前点名");
    }

    const results = await db.$transaction(async (tx) => {
      const out = [];
      for (const entry of entries) {
        out.push(await dispatchAttendance(tx, lesson.id, lesson.class.id, entry, teacher.id));
        if (entry.feedback && entry.feedback.trim()) {
          await tx.lessonFeedback.upsert({
            where: { lessonId_studentId: { lessonId: lesson.id, studentId: entry.studentId } },
            create: { lessonId: lesson.id, studentId: entry.studentId, note: entry.feedback.trim(), byTeacherId: teacher.id },
            update: { note: entry.feedback.trim(), byTeacherId: teacher.id },
          });
        }
      }
      await tx.lesson.update({ where: { id: lesson.id }, data: { status: "DONE" } });
      return out;
    });

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return errorResponse(e);
  }
}
