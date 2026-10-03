import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getAdminSession, studentScope } from "@/lib/session";
import { lessonOccupancy } from "@/lib/rules";
import { melbourneToday, nextOccurrence, weekdayName, fmtMin } from "@/lib/time";

// 班级页。R6：senior 看名单；junior 只见余位数量——名单查询只对 senior 发出，
// junior 的页面载荷里根本没有名单数据（不是渲染时隐藏）。
export default async function ClassesPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");
  const isSenior = admin.level === "SENIOR";
  const today = melbourneToday();

  const classes = await db.class.findMany({
    include: {
      teacher: { select: { name: true } },
      _count: { select: { studentTimes: { where: { status: "ACTIVE" } } } },
    },
    orderBy: { id: "asc" },
  });

  const rosterByClass = new Map<number, string[]>();
  if (isSenior) {
    const roster = await db.studentTime.findMany({
      where: { status: "ACTIVE", classId: { in: classes.map((c) => c.id) } },
      include: { user: { select: { name: true } } },
    });
    for (const st of roster) {
      const list = rosterByClass.get(st.classId) ?? [];
      list.push(st.user.name);
      rosterByClass.set(st.classId, list);
    }
  }

  const rows = await Promise.all(classes.map(async (c) => {
    const date = nextOccurrence(c.weekday, today);
    const occ = await lessonOccupancy(db, c.id, date);
    const lesson = await db.lesson.findUnique({ where: { classId_date: { classId: c.id, date } }, select: { id: true } });
    return { c, date, seats: c.capacity - occ.total, lessonId: lesson?.id ?? null };
  }));

  return (
    <>
      <h1>班级 <span className="muted" style={{ fontSize: 14 }}>{classes.length} 个固定班 · 容量按节计（R7）</span></h1>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>班级</th><th>时间</th><th>老师</th><th>在读</th><th>余位（下节）</th>{isSenior && <th>名单</th>}</tr>
          </thead>
          <tbody>
            {rows.map(({ c, date, seats, lessonId }) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong> <span className="muted">({c.subject} Y{c.yearLevel})</span></td>
                <td>
                  {weekdayName(c.weekday)} {fmtMin(c.startMin)}-{fmtMin(c.endMin)}
                  <br /><span className="muted" style={{ fontSize: 12 }}>
                    下节 {lessonId ? <Link href={`/admin/lessons/${lessonId}`}>{date}</Link> : date}
                  </span>
                </td>
                <td className="muted">{c.teacher.name}</td>
                <td>{c._count.studentTimes}</td>
                <td><span className={`badge ${seats > 2 ? "ok" : seats > 0 ? "warn" : "bad"}`}>{seats > 0 ? `${seats} 位` : "已满"}</span></td>
                {isSenior && <td className="muted">{rosterByClass.get(c.id)?.join("、") || "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isSenior && <p className="notice">你的权限只显示余位数量，不显示名单（R6）。</p>}
    </>
  );
}
