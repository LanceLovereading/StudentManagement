import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { melbourneToday, nextOccurrence, weekdayName, fmtMin } from "@/lib/time";
import { EditClassForm, ClassStatusButton } from "@/components/class-forms";

// 调班页：改时间/换老师/调容量/停开重开。仅 senior（junior 到此一律不可见，R6）。
// 校验在服务端：R2 / R12b / 改时间后在读学生不撞班（R1）/ 容量不低于现有占用。
export default async function ClassEditPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");
  if (admin.level !== "SENIOR") notFound();
  const { id } = await params;
  const cls = await db.class.findUnique({
    where: { id: Number(id) },
    include: {
      teacher: { select: { id: true, name: true } },
      studentTimes: { where: { status: "ACTIVE" }, include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!cls) notFound();

  const teachers = await db.teacher.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } });
  const subjects = [...new Set((await db.class.findMany({ select: { subject: true } })).map((c) => c.subject))];
  const today = melbourneToday();
  const nextDate = nextOccurrence(cls.weekday, today);
  const nextLesson = await db.lesson.findUnique({ where: { classId_date: { classId: cls.id, date: nextDate } } });

  return (
    <>
      <h1>
        排课 · {cls.name}{" "}
        <span className="muted" style={{ fontSize: 14 }}>
          {weekdayName(cls.weekday)} {fmtMin(cls.startMin)}-{fmtMin(cls.endMin)} · {cls.teacher.name} · {cls.status === "OPEN" ? "开课中" : "已停开"}
        </span>
      </h1>

      <div className="card">
        <h2>编辑 <span className="muted">改时间会自动校验在读学生不撞班；容量不能低于现有占用</span></h2>
        <EditClassForm
          classId={cls.id}
          teachers={teachers}
          subjects={subjects}
          initial={{
            name: cls.name, subject: cls.subject, yearLevel: cls.yearLevel, teacherId: cls.teacherId,
            weekday: cls.weekday, startMin: cls.startMin, endMin: cls.endMin, capacity: cls.capacity,
          }}
        />
      </div>

      <div className="card">
        <h2>在读名单（{cls.studentTimes.length}）</h2>
        {cls.studentTimes.length === 0 ? (
          <p className="muted">暂无学生。</p>
        ) : (
          <table className="table">
            <tbody>
              {cls.studentTimes.map((st) => (
                <tr key={st.id}>
                  <td><Link href={`/admin/students/${st.userId}`}><strong>{st.user.name}</strong></Link></td>
                  <td className="muted">报名于 {st.startedAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {nextLesson && (
          <p className="muted" style={{ fontSize: 13 }}>
            下一节 <Link href={`/admin/lessons/${nextLesson.id}`}>{nextDate}</Link>（教师点名入口在教师端）
          </p>
        )}
      </div>

      <div className="card">
        <h2>状态</h2>
        <p className="muted">停开后不再接受排班与兑换，在读学生与已排课节不受影响。</p>
        <ClassStatusButton classId={cls.id} status={cls.status} />
      </div>

      <p><Link href="/admin/classes">← 返回班级列表</Link></p>
    </>
  );
}
