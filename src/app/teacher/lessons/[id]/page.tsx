import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getTeacherSession } from "@/lib/session";
import { weekdayName, fmtMin } from "@/lib/time";
import RollCallPanel, { type PanelOccupant } from "./panel";

// 点名 / 反馈操作台。名单 = 在读名单 + 本节单节占位（试听/补课）。
// 点名分发见 lib/rollcall.ts：在读与补课照扣课时，试听走券状态机。
// 「新入班」= studentTime.startedAt 距本节课 ≤14 天，让老师一眼看到今天谁是新来的。
export default async function TeacherLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const teacher = await getTeacherSession();
  if (!teacher) redirect("/login");
  const { id } = await params;
  const lesson = await db.lesson.findUnique({
    where: { id: Number(id) },
    include: {
      class: { include: { teacher: { select: { id: true, name: true } } } },
      orderLessons: { include: { voucher: true, student: { select: { id: true, name: true } } } },
      feedbacks: true,
    },
  });
  if (!lesson) notFound();
  if (lesson.class.teacher.id !== teacher.id) notFound();

  const roster = await db.studentTime.findMany({
    where: { classId: lesson.classId, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true } } },
  });
  const attendance = await db.caiwu.findMany({
    where: { reason: "ATTENDANCE", ref: `lesson:${lesson.id}` },
  });
  const attendanceByUser = new Map(attendance.map((c) => [c.userId, c]));
  const feedbackByUser = new Map(lesson.feedbacks.map((f) => [f.studentId, f.note]));

  const NEW_STUDENT_DAYS = 14;
  const lessonStartMs = new Date(`${lesson.date}T00:00:00Z`).getTime();
  type Occ = { studentId: number; name: string; type: PanelOccupant["type"]; isNew?: boolean; marked: string | null };
  const seen = new Set<number>();
  const occupants: Occ[] = [];
  for (const st of roster) {
    seen.add(st.userId);
    occupants.push({
      studentId: st.userId,
      name: st.user.name,
      type: "在读",
      isNew: st.startedAt.getTime() >= lessonStartMs - NEW_STUDENT_DAYS * 86400000,
      marked: attendanceByUser.get(st.userId)?.status ?? null,
    });
  }
  for (const ol of lesson.orderLessons) {
    if (seen.has(ol.studentId)) continue;
    seen.add(ol.studentId);
    const isTrial = ol.voucher?.kind === "TRIAL";
    const marked = isTrial
      ? ol.voucher!.status === "REDEEMED" ? null : ol.voucher!.status
      : attendanceByUser.get(ol.studentId)?.status ?? null;
    occupants.push({ studentId: ol.studentId, name: ol.student.name, type: isTrial ? "试听" : "补课", marked });
  }

  return (
    <>
      <h1>
        点名 · {lesson.class.name}{" "}
        <span className="muted" style={{ fontSize: 14 }}>
          {lesson.date} {weekdayName(lesson.class.weekday)} {fmtMin(lesson.class.startMin)}-{fmtMin(lesson.class.endMin)} · {lesson.status}
        </span>
      </h1>
      <div className="card">
        {lesson.status === "CANCELLED" ? (
          <p className="notice">本节课已取消（学校原因）——不产生任何扣减，课时自然保留。</p>
        ) : (
          <RollCallPanel
            lessonId={lesson.id}
            occupants={occupants.map((o) => ({ ...o, feedback: feedbackByUser.get(o.studentId) ?? "" }))}
          />
        )}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        出勤与缺勤都照扣课时（每一次实际授课都有成本）；试听学生免费，出勤即券状态迁移；「新入班」= 最近 14 天内进班的学生；余额不足的学生会在这里被单独指出，由教务处理。
      </p>
    </>
  );
}
