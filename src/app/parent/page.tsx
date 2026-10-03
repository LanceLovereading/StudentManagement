import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getParentSession } from "@/lib/session";
import { getStudentSchedule } from "@/lib/view";
import { fmtDate } from "@/lib/time";
import { StatusBadge } from "@/components/badges";
import { LogoutButton } from "../admin/chrome";

// 家长门户（只读）：孩子的状态、余额、接下来的安排。
// 一个家长可有多个孩子（student_parent 多对多）；家长角色没有任何写接口。
export default async function ParentPage() {
  const me = await getParentSession();
  if (!me) redirect("/login");
  const links = await db.studentParent.findMany({
    where: { parentId: me.id },
    include: { student: { select: { id: true, name: true } } },
    orderBy: { studentId: "asc" },
  });

  const children = (await Promise.all(links.map(async (l) => ({ link: l, view: await getStudentSchedule(l.student.id) }))))
    .filter((c) => c.view);

  return (
    <>
      <header className="topbar">
        <span className="brand">Austin Edu</span>
        <span className="who" style={{ flex: 1 }}>{me.name} · 家长中心</span>
        <LogoutButton />
      </header>
      <div className="container">
        {children.length === 0 && (
          <div className="card"><p className="muted">还没有关联的学生——请联系教务老师。</p></div>
        )}
        {children.map(({ link, view }) => {
          const v = view!;
          return (
            <section className="card" key={link.id}>
              <h2>
                {v.user.name} <StatusBadge status={v.user.status} />{" "}
                <span className="muted" style={{ fontSize: 13 }}>剩余 {v.balance} 课时</span>
              </h2>
              {v.next ? (
                <p>
                  下节课：<strong>{fmtDate(v.next.date)} {v.next.time}</strong> · {v.next.name}
                </p>
              ) : (
                <p className="muted">暂无排课。</p>
              )}
              {v.upcoming.length > 0 && (
                <table className="table">
                  <tbody>
                    {v.upcoming.slice(0, 4).map((i) => (
                      <tr key={i.key}>
                        <td>{fmtDate(i.date)}</td>
                        <td>{i.time}</td>
                        <td><strong>{i.name}</strong> {i.isNew && <span className="badge ok">新</span>}</td>
                        <td><span className="badge gray">{i.kind}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
        <p className="notice">调课、请假、续费请联系教务老师；本页为只读视图。</p>
      </div>
    </>
  );
}
