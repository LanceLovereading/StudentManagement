import { redirect } from "next/navigation";
import { getUserSession } from "@/lib/session";
import { getStudentSchedule } from "@/lib/view";
import { addDays, fmtDate, melbourneToday, weekdayName, weekdayOf, fmtMin } from "@/lib/time";
import { LogoutButton } from "../admin/chrome";

// 与教务端排班表同一套时间轴参数与 CSS（.cal-*），学生看到的"上课时间"和教务是同一张图。
const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const PX_PER_MIN = 1.1;

// 学生端：只读「我的课表」。下节课 + 本周日历（未来 7 天）+ 更远的安排。
// 学生角色没有任何写接口（R5）：本页全部是查询，动作按钮只有"退出"。
export default async function MyPage() {
  const me = await getUserSession();
  if (!me) redirect("/login");
  const view = await getStudentSchedule(me.id);
  if (!view) redirect("/login");
  const { user, balance, upcoming, next } = view;

  const today = melbourneToday();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const inWeek = new Map<string, typeof upcoming>();
  const far: typeof upcoming = [];
  for (const i of upcoming) {
    if (days.includes(i.date)) inWeek.set(i.date, [...(inWeek.get(i.date) ?? []), i]);
    else far.push(i);
  }

  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START / 60 + i);

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

        <div className="card" style={{ overflowX: "auto" }}>
          <h2>本周课表 <span className="muted">未来 7 天；单节约课出现在具体那天</span></h2>
          {upcoming.length === 0 && <p className="muted">还没有安排——请联系你的教务老师。</p>}
          <div className="cal-wrap">
            <div className="cal">
              <div />
              {days.map((d) => (
                <div key={d} className={`cal-head ${d === today ? "today" : ""}`}>
                  {d === today ? "今天" : weekdayName(weekdayOf(d))}
                  <span className="d">{d.slice(5)}</span>
                </div>
              ))}

              <div className="cal-axis">
                {hours.map((h) => (
                  <span key={h} style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }}>{fmtMin(h * 60)}</span>
                ))}
              </div>

              {days.map((d) => (
                <div key={d} className={`cal-day ${d === today ? "today" : ""}`}>
                  {(inWeek.get(d) ?? []).map((i) => (
                    <div
                      key={i.key}
                      className="cal-block"
                      style={{ top: (i.startMin - DAY_START) * PX_PER_MIN, height: (i.endMin - i.startMin) * PX_PER_MIN - 4, left: "2px", width: "calc(100% - 7px)" }}
                    >
                      <strong>{i.name}</strong>
                      <span className="t">{i.time}</span>
                      <span className="t">{i.kind === "单节" ? "单节约课" : i.teacher}</span>
                      {i.isNew && <span className="badge ok">新</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {far.length > 0 && (
          <div className="card">
            <h2>更远的安排</h2>
            {far.map((i) => (
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
        )}
      </div>
    </>
  );
}
