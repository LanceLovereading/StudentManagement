import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { melbourneToday, nextOccurrence, weekdayOf, weekdayName, fmtMin } from "@/lib/time";
import { CreateClassForm } from "@/components/class-forms";

// 排班表 = 周历。固定班是周循环，一屏回答"谁、哪天几点、在谁手上、还有没有位"。
// 块上人数是周循环事实（在读/容量）；单节余位（含试听占位）在兑换预告与班级详情里看。
// R6：junior 无名单、无建班/编辑——块只有人数且不可点（详情页对 junior 是 404），不是渲染后隐藏。
const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const PX_PER_MIN = 1.1;
const DAY_HEIGHT = (DAY_END - DAY_START) * PX_PER_MIN;

// 同一天时间重叠的班分道摆放：按"重叠簇"切分（首尾相接不重叠的簇各自独立），
// 簇内贪心塞道——互不重叠的班保持全宽，只有真撞时间的班才并排。
function layoutDay(items: { id: number; startMin: number; endMin: number }[]) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const result = new Map<number, { lane: number; lanes: number }>();
  let cluster: typeof sorted = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = it.endMin;
      result.set(it.id, { lane, lanes: 1 });
    }
    const total = Math.max(laneEnds.length, 1);
    for (const it of cluster) result.get(it.id)!.lanes = total;
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();
  return result;
}

export default async function ClassesPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");
  const isSenior = admin.level === "SENIOR";
  const today = melbourneToday();
  const todayWd = weekdayOf(today);

  const classes = await db.class.findMany({
    include: {
      teacher: { select: { name: true } },
      _count: { select: { studentTimes: { where: { status: "ACTIVE" } } } },
    },
    orderBy: { id: "asc" },
  });
  const subjects = [...new Set(classes.map((c) => c.subject))];
  const teachers = await db.teacher.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } });

  const byDay = new Map<number, typeof classes>();
  for (const c of classes) byDay.set(c.weekday, [...(byDay.get(c.weekday) ?? []), c]);

  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START / 60 + i);
  const days = [1, 2, 3, 4, 5, 6, 7];

  return (
    <>
      <h1>排班表 <span className="muted" style={{ fontSize: 14 }}>{classes.length} 个固定班 · 容量按节计（R7）{isSenior ? " · 点班级进详情" : ""}</span></h1>

      {isSenior && (
        <div className="card">
          <h2>建班 <span className="muted">服务端强制：R2 教师不撞班 · R12b 班时落在教师可用窗内</span></h2>
          <CreateClassForm teachers={teachers} subjects={subjects} />
        </div>
      )}

      <div className="cal-wrap">
        <div className="cal">
          <div />
          {days.map((w) => (
            <div key={w} className={`cal-head ${w === todayWd ? "today" : ""}`}>
              {w === todayWd ? "今天" : weekdayName(w)}
              <span className="d">{nextOccurrence(w, today).slice(5)}</span>
            </div>
          ))}

          <div className="cal-axis">
            {hours.map((h) => (
              <span key={h} style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }}>{fmtMin(h * 60)}</span>
            ))}
          </div>

          {days.map((w) => {
            const dayClasses = byDay.get(w) ?? [];
            const layout = layoutDay(dayClasses);
            return (
              <div key={w} className={`cal-day ${w === todayWd ? "today" : ""}`}>
                {dayClasses.map((c) => {
                  const { lane, lanes } = layout.get(c.id) ?? { lane: 0, lanes: 1 };
                  const style = {
                    top: (c.startMin - DAY_START) * PX_PER_MIN,
                    height: (c.endMin - c.startMin) * PX_PER_MIN - 4,
                    left: `${(lane * 100) / lanes}%`,
                    width: `calc(${100 / lanes}% - 5px)`,
                  };
                  const body = (
                    <>
                      <strong>{c.name}</strong>
                      <span className="t">{fmtMin(c.startMin)}-{fmtMin(c.endMin)}</span>
                      <span className="t">{c.teacher.name} · {c._count.studentTimes}/{c.capacity} 人</span>
                      {c.status !== "OPEN" && <span className="badge gray">停开</span>}
                    </>
                  );
                  return isSenior ? (
                    <Link key={c.id} href={`/admin/classes/${c.id}`} title={`${c.name} · ${c.teacher.name}`} className={`cal-block ${c.status !== "OPEN" ? "closed" : ""}`} style={style}>
                      {body}
                    </Link>
                  ) : (
                    <div key={c.id} title={`${c.name} · ${c.teacher.name}`} className={`cal-block ${c.status !== "OPEN" ? "closed" : ""}`} style={style}>
                      {body}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {!isSenior && (
        <p className="notice">
          给自己名下的学生排课在<Link href="/admin/students">学生页</Link>进行（添加课 / 兑换 / 转化，R6 读写自己学生）；建班、调班、停开与在读名单仅 senior。
        </p>
      )}
    </>
  );
}
