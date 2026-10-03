import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { melbourneToday, nextOccurrence, weekdayOf, weekdayName, fmtMin, addDays } from "@/lib/time";
import { lessonOccupancy } from "@/lib/rules";
import { CreateClassForm, InstantiateTemplateForm, DeleteTemplateButton } from "@/components/class-forms";

// 排班表 = 周历 + 当日议程两种视图。
// 周历回答"哪天几点有课"；同一天撞时间的班 ≤2 个并排分道，≥3 个收敛成
// "N 个班同时段"一个块（再并排就不可读了），点进当日议程看逐班整行。
// R6：junior 无名单、无建班/编辑——块与议程都只有人数，不是渲染后隐藏。
const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const PX_PER_MIN = 1.1;

type Cls = Awaited<ReturnType<typeof loadClasses>>[number];

// 同一天的班按"重叠簇"分组（首尾相接不重叠的簇各自独立），簇内贪心分道。
// 返回每班的道位；簇的道数 = 簇内同时重叠的最大班级数。
function layoutDay(items: Cls[]) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const clusters: { items: Cls[]; laneOf: Map<number, number>; lanes: number; end: number }[] = [];
  let cur: Cls[] = [];
  let curEnd = -1;
  const flush = () => {
    if (cur.length === 0) return;
    const laneEnds: number[] = [];
    const laneOf = new Map<number, number>();
    for (const it of [...cur].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)) {
      let lane = laneEnds.findIndex((end) => end <= it.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = it.endMin;
      laneOf.set(it.id, lane);
    }
    clusters.push({ items: cur, laneOf, lanes: Math.max(laneEnds.length, 1), end: curEnd });
    cur = [];
    curEnd = -1;
  };
  for (const it of sorted) {
    if (cur.length && it.startMin >= curEnd) flush();
    cur.push(it);
    curEnd = Math.max(curEnd, it.endMin);
  }
  flush();
  return clusters;
}

async function loadClasses() {
  return db.class.findMany({
    include: {
      teacher: { select: { name: true } },
      _count: { select: { studentTimes: { where: { status: "ACTIVE" } } } },
    },
    orderBy: { id: "asc" },
  });
}

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");
  const isSenior = admin.level === "SENIOR";
  const today = melbourneToday();
  const { date: dateParam } = await searchParams;

  const classes = await loadClasses();

  // ── 当日议程视图：?date=YYYY-MM-DD ──────────────────────────────
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const wd = weekdayOf(dateParam);
    const dayClasses = classes.filter((c) => c.weekday === wd);
    const rows = await Promise.all(dayClasses.map(async (c) => {
      const occ = await lessonOccupancy(db, c.id, dateParam);
      const lesson = await db.lesson.findUnique({ where: { classId_date: { classId: c.id, date: dateParam } }, select: { id: true } });
      return {
        c, occ, lessonId: lesson?.id ?? null,
        ended: dateParam > c.endDate, notStarted: dateParam < c.startDate,
      };
    }));
    rows.sort((a, b) => a.c.startMin - b.c.startMin);

    const rosterMap = new Map<number, string[]>();
    if (isSenior && rows.length > 0) {
      const roster = await db.studentTime.findMany({
        where: { status: "ACTIVE", classId: { in: rows.map((r) => r.c.id) } },
        include: { user: { select: { name: true } } },
      });
      for (const st of roster) rosterMap.set(st.classId, [...(rosterMap.get(st.classId) ?? []), st.user.name]);
    }

    return (
      <>
        <h1>
          {dateParam} {weekdayName(wd)} 课表{" "}
          <span className="muted" style={{ fontSize: 14 }}>{rows.length} 个班 · 逐班整行（撞时间也不挤）</span>
        </h1>
        <p>
          <Link href="/admin/classes">← 周视图</Link>
          <span className="muted"> ｜ </span>
          <Link href={`/admin/classes?date=${addDays(dateParam, -1)}`}>← 前一天</Link>
          <span className="muted"> ｜ </span>
          <Link href={`/admin/classes?date=${addDays(dateParam, 1)}`}>后一天 →</Link>
        </p>
        <div className="card">
          <table className="table">
            <thead>
              <tr><th>时间</th><th>班级</th><th>老师</th><th>在读/容量</th><th>该节余位</th>{isSenior && <th>名单</th>}{isSenior && <th></th>}</tr>
            </thead>
            <tbody>
              {rows.map(({ c, occ, lessonId, ended, notStarted }) => {
                const seats = c.capacity - occ.total;
                return (
                  <tr key={c.id}>
                    <td>{fmtMin(c.startMin)}-{fmtMin(c.endMin)}</td>
                    <td>
                      <strong>{c.name}</strong> <span className="muted">({c.subject} Y{c.yearLevel})</span>{" "}
                      {c.status !== "OPEN" && <span className="badge bad">已停开</span>}
                      {ended && <span className="badge gray">学期已尽</span>}
                      {notStarted && <span className="badge gray">未开课</span>}
                      <br /><span className="muted" style={{ fontSize: 12 }}>
                        课节 {lessonId ? <Link href={`/admin/lessons/${lessonId}`}>{dateParam}</Link> : `${dateParam}（未物化）`}
                      </span>
                    </td>
                    <td className="muted">{c.teacher.name}</td>
                    <td>{c._count.studentTimes}/{c.capacity}</td>
                    <td><span className={`badge ${c.status !== "OPEN" || ended ? "gray" : seats > 2 ? "ok" : seats > 0 ? "warn" : "bad"}`}>{c.status !== "OPEN" || ended ? "—" : seats > 0 ? `${seats} 位` : "已满"}</span></td>
                    {isSenior && <td className="muted">{rosterMap.get(c.id)?.join("、") || "—"}</td>}
                    {isSenior && <td><Link className="btn btn-sm" href={`/admin/classes/${c.id}`}>编辑</Link></td>}
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={8} className="muted">这一天没有排班。</td></tr>}
            </tbody>
          </table>
        </div>
        {!isSenior && <p className="notice">你的权限只显示人数/容量，不显示名单（R6）。</p>}
      </>
    );
  }

  // ── 周视图 ──────────────────────────────────────────────────────
  const subjects = [...new Set(classes.map((c) => c.subject))];
  const teachers = await db.teacher.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } });
  const templates = isSenior
    ? await db.classTemplate.findMany({ include: { teacher: { select: { name: true } } }, orderBy: { id: "asc" } })
    : [];

  const byDay = new Map<number, Cls[]>();
  for (const c of classes) byDay.set(c.weekday, [...(byDay.get(c.weekday) ?? []), c]);
  const dayDate = (w: number) => nextOccurrence(w, today);
  const todayWd = weekdayOf(today);

  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START / 60 + i);
  const days = [1, 2, 3, 4, 5, 6, 7];

  return (
    <>
      <h1>排班表 <span className="muted" style={{ fontSize: 14 }}>{classes.length} 个固定班 · 容量按节计（R7）· 点日期看当日课表</span></h1>

      {isSenior && (
        <div className="card">
          <h2>建班 <span className="muted">服务端强制：R2 教师不撞班 · R12b 学期内未来 4 节教师有可用窗</span></h2>
          <CreateClassForm teachers={teachers} subjects={subjects} today={today} />
        </div>
      )}

      {isSenior && templates.length > 0 && (
        <div className="card">
          <h2>从模板开班 <span className="muted">模板只存课程骨架；新学期 = 模板 + 学期起止日期，历史班与名单不受影响</span></h2>
          <InstantiateTemplateForm
            templates={templates.map((t) => ({ id: t.id, name: t.name, teacher: { name: t.teacher.name }, weekday: t.weekday, startMin: t.startMin, endMin: t.endMin }))}
            today={today}
            defaultEnd={addDays(today, 70)}
          />
          <table className="table" style={{ marginTop: 8 }}>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong> <span className="muted">({t.subject} Y{t.yearLevel})</span></td>
                  <td className="muted">{weekdayName(t.weekday)} {fmtMin(t.startMin)}-{fmtMin(t.endMin)} · {t.teacher.name} · 容量 {t.capacity}</td>
                  <td style={{ textAlign: "right" }}><DeleteTemplateButton id={t.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="cal-wrap">
        <div className="cal">
          <div />
          {days.map((w) => (
            <Link key={w} href={`/admin/classes?date=${dayDate(w)}`} className={`cal-head ${w === todayWd ? "today" : ""}`}>
              {w === todayWd ? "今天" : weekdayName(w)}
              <span className="d">{dayDate(w).slice(5)}</span>
            </Link>
          ))}

          <div className="cal-axis">
            {hours.map((h) => (
              <span key={h} style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }}>{fmtMin(h * 60)}</span>
            ))}
          </div>

          {days.map((w) => {
            const clusters = layoutDay(byDay.get(w) ?? []);
            return (
              <div key={w} className={`cal-day ${w === todayWd ? "today" : ""}`}>
                {clusters.map(({ items, laneOf, lanes, end }) => {
                  if (lanes <= 2) {
                    return items.map((c) => {
                      const lane = laneOf.get(c.id) ?? 0;
                      const style = {
                        top: (c.startMin - DAY_START) * PX_PER_MIN,
                        height: (c.endMin - c.startMin) * PX_PER_MIN - 4,
                        left: `${(lane * 100) / lanes}%`,
                        width: `calc(${100 / lanes}% - 5px)`,
                      };
                      return <ClassBlock key={c.id} c={c} senior={isSenior} style={style} />;
                    });
                  }
                  // 撞时间的班太多：收敛成一个块，当日议程里逐班看
                  const start = Math.min(...items.map((c) => c.startMin));
                  const style = {
                    top: (start - DAY_START) * PX_PER_MIN,
                    height: (end - start) * PX_PER_MIN - 4,
                    left: "0%", width: "calc(100% - 5px)",
                  };
                  return (
                    <Link
                      key={`cluster-${items[0].id}`}
                      href={`/admin/classes?date=${dayDate(w)}`}
                      className="cal-block more"
                      style={style}
                      title={items.map((c) => `${c.name} ${fmtMin(c.startMin)}`).join("；")}
                    >
                      <strong>{items.length} 个班同时段</strong>
                      <span className="t">{fmtMin(start)}-{fmtMin(end)}</span>
                      <span className="t">{items[0].name} 等 · 点击看当日课表</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {!isSenior && (
        <p className="notice">
          给自己名下的学生排课：工作台花名册 → 学生详情 → 添加课 / 兑换 / 转化（R6 读写自己学生）；建班、调班、停开与在读名单仅 senior。
        </p>
      )}
    </>
  );
}

function ClassBlock({ c, senior, style }: { c: Cls; senior: boolean; style: React.CSSProperties }) {
  const body = (
    <>
      <strong>{c.name}</strong>
      <span className="t">{fmtMin(c.startMin)}-{fmtMin(c.endMin)}</span>
      <span className="t">{c.teacher.name} · {c._count.studentTimes}/{c.capacity} 人</span>
      {c.status !== "OPEN" && <span className="badge gray">停开</span>}
    </>
  );
  return senior ? (
    <Link href={`/admin/classes/${c.id}`} title={`${c.name} · ${c.teacher.name}`} className={`cal-block ${c.status !== "OPEN" ? "closed" : ""}`} style={style}>
      {body}
    </Link>
  ) : (
    <div title={`${c.name} · ${c.teacher.name}`} className={`cal-block ${c.status !== "OPEN" ? "closed" : ""}`} style={style}>
      {body}
    </div>
  );
}
