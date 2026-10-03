import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getTeacherSession } from "@/lib/session";
import { runDailyScan } from "@/lib/scan";
import { melbourneToday, nextOccurrence, weekdayName, fmtMin } from "@/lib/time";

// 教师首页：我教的班 + 下一节（点名入口）+ 我的可用时间。
export default async function TeacherHome() {
  const teacher = await getTeacherSession();
  if (!teacher) redirect("/login");
  await runDailyScan(); // 幂等：保证每个班都有"下一节"课节可点名
  const today = melbourneToday();
  const classes = await db.class.findMany({
    where: { teacherId: teacher.id },
    include: { studentTimes: { where: { status: "ACTIVE" }, select: { id: true } } },
    orderBy: { id: "asc" },
  });

  const rows = await Promise.all(classes.map(async (c) => {
    const date = nextOccurrence(c.weekday, today);
    const lesson = await db.lesson.findUnique({ where: { classId_date: { classId: c.id, date } } });
    return { c, date, lessonId: lesson?.id ?? null };
  }));

  return (
    <>
      <h1>我的课表</h1>
      <div className="card">
        <table className="table">
          <thead><tr><th>班级</th><th>时间</th><th>在读</th><th>下一节</th><th></th></tr></thead>
          <tbody>
            {rows.map(({ c, date, lessonId }) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong> <span className="muted">({c.subject})</span></td>
                <td>{weekdayName(c.weekday)} {fmtMin(c.startMin)}-{fmtMin(c.endMin)}</td>
                <td>{c.studentTimes.length}</td>
                <td>{date}</td>
                <td>
                  {lessonId && <Link className="btn btn-sm btn-primary" href={`/teacher/lessons/${lessonId}`}>点名 / 反馈</Link>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">暂未排课。</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>我的可上课时间</h2>
        <p className="muted">兼职教师自助登记每周可用时段（不得重叠）。</p>
        <Link className="btn" href="/teacher/availability">管理可用时间</Link>
      </div>
    </>
  );
}
