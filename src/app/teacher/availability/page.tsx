import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getTeacherSession } from "@/lib/session";
import { weekdayName, fmtMin } from "@/lib/time";
import { AddWindowForm, DeleteWindowButton } from "./forms";

// 我的可上课时间：自助登记，R12a 服务端校验不重叠。班级时间必须落在可用窗内（R12b）
// 在建班/调班侧强制——本切片无建班入口，模型已就位。
export default async function AvailabilityPage() {
  const teacher = await getTeacherSession();
  if (!teacher) redirect("/login");
  const windows = await db.teacherTime.findMany({
    where: { teacherId: teacher.id },
    orderBy: [{ weekday: "asc" }, { startMin: "asc" }],
  });

  return (
    <>
      <h1>我的可上课时间</h1>
      <div className="card">
        <h2>已登记（{windows.length} 段）</h2>
        {windows.length === 0 && <p className="muted">还没有登记——教务排班依赖这里。</p>}
        <table className="table">
          <tbody>
            {windows.map((w) => (
              <tr key={w.id}>
                <td>{weekdayName(w.weekday)}</td>
                <td>{fmtMin(w.startMin)} - {fmtMin(w.endMin)}</td>
                <td style={{ textAlign: "right" }}><DeleteWindowButton id={w.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>新增时段</h2>
        <AddWindowForm />
      </div>
    </>
  );
}
