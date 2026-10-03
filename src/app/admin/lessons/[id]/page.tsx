import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { weekdayName, fmtMin } from "@/lib/time";
import { fmtDateTime } from "@/components/badges";
import CancelLessonButton from "./cancel-button";

// admin 课节页：这节课的名单/占位与出勤状态（点名由教师在教师端完成）；学校原因取消入口。
export default async function AdminLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");
  const { id } = await params;
  const lesson = await db.lesson.findUnique({
    where: { id: Number(id) },
    include: {
      class: { include: { teacher: { select: { name: true } } } },
      orderLessons: { include: { voucher: true, student: { select: { id: true, name: true } } } },
      feedbacks: true,
    },
  });
  if (!lesson) notFound();

  const roster = await db.studentTime.findMany({
    where: { classId: lesson.classId, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true } } },
  });
  const attendance = await db.caiwu.findMany({ where: { reason: "ATTENDANCE", ref: `lesson:${lesson.id}` } });
  const attendanceByUser = new Map(attendance.map((c) => [c.userId, c]));
  const feedbackByUser = new Map(lesson.feedbacks.map((f) => [f.studentId, f.note]));

  type Row = { studentId: number; name: string; type: "在读" | "试听" | "补课"; mark: string; feedback: string };
  const rows: Row[] = [];
  const seen = new Set<number>();
  for (const st of roster) {
    seen.add(st.userId);
    const c = attendanceByUser.get(st.userId);
    rows.push({ studentId: st.userId, name: st.user.name, type: "在读", mark: c ? c.status! : "未点名", feedback: feedbackByUser.get(st.userId) ?? "" });
  }
  for (const ol of lesson.orderLessons) {
    if (seen.has(ol.studentId)) continue;
    seen.add(ol.studentId);
    const isTrial = ol.voucher?.kind === "TRIAL";
    const mark = isTrial
      ? ol.voucher!.status === "REDEEMED" ? "未点名" : ol.voucher!.status === "ATTENDED" ? "试听完成" : "缺席·券作废"
      : attendanceByUser.get(ol.studentId)?.status ?? "未点名";
    rows.push({ studentId: ol.studentId, name: ol.student.name, type: isTrial ? "试听" : "补课", mark, feedback: feedbackByUser.get(ol.studentId) ?? "" });
  }

  return (
    <>
      <h1>
        课节 · {lesson.class.name}{" "}
        <span className="muted" style={{ fontSize: 14 }}>
          {lesson.date} {weekdayName(lesson.class.weekday)} {fmtMin(lesson.class.startMin)}-{fmtMin(lesson.class.endMin)} · {lesson.class.teacher.name} · {lesson.status}
        </span>
      </h1>
      <div className="card">
        <table className="table">
          <thead><tr><th>学生</th><th>类型</th><th>出勤</th><th>课堂反馈</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td><strong>{r.name}</strong></td>
                <td><span className={`badge ${r.type === "在读" ? "ok" : r.type === "试听" ? "" : "warn"}`}>{r.type}</span></td>
                <td>
                  <span className={`badge ${r.mark.startsWith("PRESENT") || r.mark === "试听完成" ? "ok" : r.mark === "未点名" ? "gray" : "bad"}`}>{r.mark}</span>
                </td>
                <td className="muted">{r.feedback || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="muted">还没有学生。</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card">
        {lesson.status === "SCHEDULED" ? (
          <>
            <p className="muted">老师请假等学校原因 → 取消本节课：不产生任何扣减，课时自然保留（R5）。点名由教师在教师端操作。</p>
            <CancelLessonButton lessonId={lesson.id} />
          </>
        ) : (
          <p className="muted">状态 {lesson.status} · 最后变更 {lesson.status === "DONE" ? "点名完成" : ""}</p>
        )}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>本页由教务查看；最后更新 {fmtDateTime(new Date())}。</p>
    </>
  );
}
