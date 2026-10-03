import type { Prisma, Class } from "@prisma/client";
import { db } from "./db";
import { RuleError } from "./errors";
import { addDays, melbourneToday, nextOccurrence } from "./time";
import { ENDING_THRESHOLD, getBalance, type Db } from "./ledger";

export function overlaps(aS: number, aE: number, bS: number, bE: number) {
  return aS < bE && aE > bS;
}

// R1（单节版）：学生在该时段是否已有占用——ACTIVE 循环班，或同一天的单节预约（试听/补课）。
// 返回冲突来源的班名（含"已在该班"）；null = 无冲突。
export async function findSingleLessonConflict(
  client: Db,
  studentId: number,
  cls: { id: number; name: string; weekday: number; startMin: number; endMin: number },
  date: string
): Promise<string | null> {
  const active = await client.studentTime.findMany({
    where: { userId: studentId, status: "ACTIVE" },
    include: { class: true },
  });
  for (const st of active) {
    if (st.class.weekday === cls.weekday && overlaps(st.class.startMin, st.class.endMin, cls.startMin, cls.endMin)) {
      return st.class.name;
    }
  }
  const bookings = await client.orderLesson.findMany({
    where: { studentId, lesson: { date, status: { not: "CANCELLED" } } },
    include: { lesson: { include: { class: true } } },
  });
  for (const b of bookings) {
    const c = b.lesson.class;
    if (c.weekday === cls.weekday && overlaps(c.startMin, c.endMin, cls.startMin, cls.endMin)) return c.name;
  }
  return null;
}

// R7：单节占用 = student_time 名单 + order_lesson 占位行（试听/补课同池计数）
export async function lessonOccupancy(client: Db, classId: number, date: string) {
  const roster = await client.studentTime.count({ where: { classId, status: "ACTIVE" } });
  const lesson = await client.lesson.findUnique({
    where: { classId_date: { classId, date } },
    include: { orderLessons: { select: { id: true } } },
  });
  const visitors = lesson?.orderLessons.length ?? 0;
  return { roster, visitors, total: roster + visitors };
}

// 单节预约（券兑换）的完整校验：R1 + R7。被兑换页预告与兑换接口共用——预告即裁决逻辑。
export async function checkSingleRedeem(client: Db, studentId: number, cls: Class, date: string) {
  const conflict = await findSingleLessonConflict(client, studentId, cls, date);
  if (conflict) throw new RuleError("R1_CONFLICT", `时间冲突：与「${conflict}」重叠`);
  const occ = await lessonOccupancy(client, cls.id, date);
  if (occ.total + 1 > cls.capacity) throw new RuleError("R7_FULL", `该节已满（${occ.total}/${cls.capacity}）`);
}

// 正式排班（转化 / 添加课）的完整校验：R1 循环版 + R3 余额门槛 + R7 未来 4 节逐节。
// 注意须在事务内用 tx 调用——转化先充值后排班，读余额必须看到事务内的入账。
export async function checkEnroll(client: Db, studentId: number, classId: number) {
  const cls = await client.class.findUnique({ where: { id: classId } });
  if (!cls) throw new RuleError("NOT_FOUND", "班级不存在");
  if (cls.status !== "OPEN") throw new RuleError("CLASS_CLOSED", "班级已停开");

  const active = await client.studentTime.findMany({
    where: { userId: studentId, status: "ACTIVE" },
    include: { class: true },
  });
  for (const st of active) {
    if (st.classId === classId) throw new RuleError("R1_CONFLICT", `已在该班（${cls.name}）`);
    if (st.class.weekday === cls.weekday && overlaps(st.class.startMin, st.class.endMin, cls.startMin, cls.endMin)) {
      throw new RuleError("R1_CONFLICT", `时间冲突：与「${st.class.name}」重叠`);
    }
  }

  const bal = await getBalance(client, studentId);
  if (bal < ENDING_THRESHOLD) throw new RuleError("R3_LOW_BALANCE", `余额 ${bal} 不足 ${ENDING_THRESHOLD}，需先充值`);

  const today = melbourneToday();
  const first = nextOccurrence(cls.weekday, today);
  for (let i = 0; i < 4; i++) {
    const date = addDays(first, 7 * i);
    const occ = await lessonOccupancy(client, classId, date);
    if (occ.total + 1 > cls.capacity) throw new RuleError("R7_FULL", `${date} 该节已满（${occ.total}/${cls.capacity}）`);
  }
  return cls;
}
