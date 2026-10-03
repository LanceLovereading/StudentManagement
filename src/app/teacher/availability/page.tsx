import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getTeacherSession } from "@/lib/session";
import { melbourneToday, weekdayOf, weekdayName, fmtMin } from "@/lib/time";
import { AddWindowForm, DeleteWindowButton } from "./forms";

// 我的可上课时间：按具体日期登记（档期按天变动）。R12a 服务端校验同日不重叠；
// 建班/调班时教务侧校验未来 4 节的日期都有覆盖窗（R12b）——教务排班依赖这里。
export default async function AvailabilityPage() {
  const teacher = await getTeacherSession();
  if (!teacher) redirect("/login");
  const today = melbourneToday();
  const windows = await db.teacherTime.findMany({
    where: { teacherId: teacher.id },
    orderBy: [{ date: "asc" }, { startMin: "asc" }],
  });
  const upcoming = windows.filter((w) => w.date >= today);
  const past = windows.filter((w) => w.date < today);

  return (
    <>
      <h1>我的可上课时间 <span className="muted" style={{ fontSize: 14 }}>按具体日期登记</span></h1>
      <div className="card">
        <h2>已登记（未来 {upcoming.length} 段）</h2>
        {upcoming.length === 0 && <p className="muted">还没有登记——教务排班依赖这里。</p>}
        <table className="table">
          <tbody>
            {upcoming.map((w) => (
              <tr key={w.id}>
                <td>{w.date} <span className="badge">{weekdayName(weekdayOf(w.date))}</span></td>
                <td>{fmtMin(w.startMin)} - {fmtMin(w.endMin)}</td>
                <td style={{ textAlign: "right" }}><DeleteWindowButton id={w.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {past.length > 0 && (
          <p className="muted" style={{ fontSize: 13 }}>另有 {past.length} 段已过去的登记（不可再用于排班）。</p>
        )}
      </div>
      <div className="card">
        <h2>新增时段 <span className="muted">同一天多段不重叠即可；教务排班要求未来 4 节都有覆盖窗</span></h2>
        <AddWindowForm today={today} />
      </div>
    </>
  );
}
