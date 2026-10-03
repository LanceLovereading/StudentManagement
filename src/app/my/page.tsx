import { redirect } from "next/navigation";
import { getUserSession } from "@/lib/session";
import { getStudentSchedule } from "@/lib/view";
import { fmtDate } from "@/lib/time";
import { LogoutButton } from "../admin/chrome";

// 学生端：只读「我的课表」。三件事——下节课、还没上的课、新安排。
// 学生角色没有任何写接口（R5）：本页全部是查询，动作按钮只有"退出"。
export default async function MyPage() {
  const me = await getUserSession();
  if (!me) redirect("/login");
  const view = await getStudentSchedule(me.id);
  if (!view) redirect("/login");
  const { user, balance, upcoming, next } = view;

  return (
    <>
      <header className="topbar">
        <span className="brand">Austin Edu</span>
        <span className="who" style={{ flex: 1 }}>{user.name} 的课表</span>
        <LogoutButton />
      </header>
      <div className="container">
        {next ? (
          <div className="next-lesson">
            <div>
              <div className="muted" style={{ fontSize: 13 }}>下节课</div>
              <div className="when">{fmtDate(next.date)} {next.time}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <strong>{next.name}</strong>
              {next.teacher && <div className="muted" style={{ fontSize: 13 }}>{next.teacher}</div>}
            </div>
          </div>
        ) : (
          <div className="next-lesson">
            <div>
              <div className="muted" style={{ fontSize: 13 }}>下节课</div>
              <div className="when">暂无安排</div>
            </div>
          </div>
        )}

        <div className="stats">
          <div className="stat">
            <div className="num">{balance}</div>
            <div className="label">剩余课时</div>
          </div>
          <div className="stat">
            <div className="num">{upcoming.length}</div>
            <div className="label">接下来的安排</div>
          </div>
          <div className="stat">
            <div className="num">{upcoming.filter((i) => i.isNew).length}</div>
            <div className="label">新安排</div>
          </div>
        </div>

        <div className="card">
          <h2>接下来的安排</h2>
          {upcoming.length === 0 && <p className="muted">还没有安排——请联系你的教务老师。</p>}
          {upcoming.map((i) => (
            <div className="queue-item" key={i.key}>
              <div className="main">
                <strong>{i.name}</strong>{" "}
                {i.isNew && <span className="badge ok">新</span>}{" "}
                <span className="sub">{fmtDate(i.date)} {i.time}{i.teacher ? ` · ${i.teacher}` : ""}</span>
              </div>
              <span className="badge gray">{i.kind}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
