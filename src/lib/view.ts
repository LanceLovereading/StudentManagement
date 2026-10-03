import { db } from "./db";
import { melbourneToday, nextOccurrence, addDays } from "./time";

// 学生课表视图：/my（学生本人）、/parent（家长看孩子）共用一份查询逻辑。
export type ScheduleItem = {
  key: string;
  date: string;
  name: string;
  time: string;
  teacher: string;
  kind: "循环" | "单节";
  isNew: boolean;
};

export async function getStudentSchedule(userId: number) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      studentTimes: {
        where: { status: "ACTIVE" },
        include: { class: { include: { teacher: { select: { name: true } } } } },
      },
      caiwu: { orderBy: { id: "desc" }, take: 1 },
      orderLessons: { include: { lesson: { include: { class: true } } } },
    },
  });
  if (!user) return null;

  const balance = user.caiwu[0]?.balanceAfter ?? 0;
  const today = melbourneToday();
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const classIds = new Set(user.studentTimes.map((st) => st.classId));

  const futureLessons = await db.lesson.findMany({
    where: { classId: { in: [...classIds] }, date: { gte: today } },
  });
  const lessonAt = new Map(futureLessons.map((l) => [`${l.classId}@${l.date}`, l]));

  const items: ScheduleItem[] = [];
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
        time: `${String(Math.floor(st.class.startMin / 60)).padStart(2, "0")}:${String(st.class.startMin % 60).padStart(2, "0")}-${String(Math.floor(st.class.endMin / 60)).padStart(2, "0")}:${String(st.class.endMin % 60).padStart(2, "0")}`,
        teacher: st.class.teacher.name, kind: "循环",
        isNew: st.startedAt >= weekAgo && i === 0,
      });
      shown++;
    }
  }
  // 单节占位（试听/补课）：不在循环表达范围内的才单列
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  for (const ol of user.orderLessons) {
    if (ol.lesson.date < today || ol.lesson.status === "CANCELLED") continue;
    if (classIds.has(ol.lesson.classId)) continue;
    items.push({
      key: `o-${ol.id}`, date: ol.lesson.date, name: `${ol.lesson.class.name}（单节）`,
      time: `${fmt(ol.lesson.class.startMin)}-${fmt(ol.lesson.class.endMin)}`,
      teacher: "", kind: "单节", isNew: ol.createdAt >= weekAgo,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  return { user, balance, upcoming: items.slice(0, 8), next: items[0] ?? null };
}
