import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUserSession } from "@/lib/session";
import { melbourneToday, nextOccurrence, addDays, weekdayName, fmtMin, fmtDate } from "@/lib/time";
import { LogoutButton } from "../admin/chrome";

// 学生端：只读「我的课表」。三件事——下节课、还没上的课、新安排。
// 学生角色没有任何写接口（R5）：本页全部是查询，动作按钮只有"退出"。
export default async function MyPage() {
  const me = await getUserSession();
  if (!me) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: me.id },
    include: {
      studentTimes: {
        where: { status: "ACTIVE" },
        include: { class: { include: { teacher: { select: { name: true } } } } },
      },
      caiwu: { orderBy: { id: "desc" }, take: 1 },
      orderLessons: { include: { lesson: { include: { class: true } } } },
    },
  });
  if (!user) redirect("/login");
  const balance = user.caiwu[0]?.balanceAfter ?? 0;
  const today = melbourneToday();
  const weekAgo = new Date(Date.now() - 7 * 864e5);

  const classIds = new Set(user.studentTimes.map((st) => st.classId));
  // 已物化的未来课节（含被取消的——取消的那节要跳过）
  const futureLessons = await db.lesson.findMany({
    where: { classId: { in: [...classIds] }, date: { gte: today } },
  });
  const lessonAt = new Map(futureLessons.map((l) => [`${l.classId}@${l.date}`, l]));

  type Item = { key: string; date: string; name: string; time: string; teacher: string; kind: "循环" | "单节"; isNew: boolean };
  const items: Item[] = [];

  // 循环班：接下来 3 个出现日期；被取消的那节顺延
  for (const st of user.studentTimes) {
    const first = nextOccurrence(st.class.weekday, today);
    let shown = 0;
    for (let i = 0; i < 8 && shown < 3; i++) {
      const date = addDays(first, 7 * i);
      const lesson = lessonAt.get(`${st.classId}@${date}`);
      if (lesson?.status === "CANCELLED") continue;
      items.push({
        key: `c-${st.id}-${date}`, date, name: st.class.name,
        time: `${fmtMin(st.class.startMin)}-${fmtMin(st.class.endMin)}`,
        teacher: st.class.teacher.name, kind: "循环",
        isNew: st.startedAt >= weekAgo && i === 0,
      });
      shown++;
    }
  }

  // 单节占位（试听/补课）：不在已列循环里的才单列
  for (const ol of user.orderLessons) {
    if (ol.lesson.date < today || ol.lesson.status === "CANCELLED") continue;
    if (classIds.has(ol.lesson.classId)) continue; // 循环班自身的占位由上一段表达
    items.push({
      key: `o-${ol.id}`, date: ol.lesson.date, name: `${ol.lesson.class.name}（单节）`,
      time: `${fmtMin(ol.lesson.class.startMin)}-${fmtMin(ol.lesson.class.endMin)}`,
      teacher: "", kind: "单节", isNew: ol.createdAt >= weekAgo,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = items.slice(0, 6);
  const next = upcoming[0];

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
            <div className="num">{items.filter((i) => i.isNew).length}</div>
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
