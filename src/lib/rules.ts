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

// 单节预约（券兑换）的完整校验：班级停开 + R1 + R7。被兑换页预告与兑换接口共用——预告即裁决逻辑。
export async function checkSingleRedeem(client: Db, studentId: number, cls: Class, date: string) {
  if (cls.status !== "OPEN") throw new RuleError("CLASS_CLOSED", "班级已停开，不再接受预约");
  const conflict = await findSingleLessonConflict(client, studentId, cls, date);
  if (conflict) throw new RuleError("R1_CONFLICT", `时间冲突：与「${conflict}」重叠`);
  const occ = await lessonOccupancy(client, cls.id, date);
  if (occ.total + 1 > cls.capacity) throw new RuleError("R7_FULL", `该节已满（${occ.total}/${cls.capacity}）`);
}

// R2：同一教师不能出现在两个重叠时间的班（建班/调班时强制，int 比较）
export async function checkTeacherConflict(
  client: Db, teacherId: number, weekday: number, startMin: number, endMin: number, excludeClassId?: number
) {
  const others = await client.class.findMany({
    where: { teacherId, weekday, ...(excludeClassId ? { id: { not: excludeClassId } } : {}) },
  });
  for (const c of others) {
    if (overlaps(startMin, endMin, c.startMin, c.endMin)) {
      throw new RuleError("R2_TEACHER_CONFLICT", `该教师在同一时间已有「${c.name}」`);
    }
  }
}

// R12b（单日原语）：指定日期的班级时间必须完整落在该教师当天登记的某个可用窗内。
// 可用窗是"具体日期 + 时段"——班是周循环，两者靠展望期对齐。
export async function checkWithinAvailability(
  client: Db, teacherId: number, date: string, startMin: number, endMin: number
) {
  const windows = await client.teacherTime.findMany({ where: { teacherId, date } });
  const inside = windows.some((w) => w.startMin <= startMin && endMin <= w.endMin);
  if (!inside) {
    throw new RuleError("R12_OUTSIDE_WINDOW", `${date} 该教师没有覆盖此时间的可用时段，需教师先登记`);
  }
}

// R12b（建班/调班版）：校验未来 4 节（与 R7 容量同一展望期）的日期教师都有覆盖窗。
// 缺哪天报哪天——教务拿着日期去找教师登记即可。
async function checkAvailabilityHorizon(
  client: Db,
  input: { teacherId: number; weekday: number; startMin: number; endMin: number }
) {
  const today = melbourneToday();
  const first = nextOccurrence(input.weekday, today);
  for (let i = 0; i < 4; i++) {
    await checkWithinAvailability(client, input.teacherId, addDays(first, 7 * i), input.startMin, input.endMin);
  }
}

// 建班校验：时间合法 + R2 教师不撞班 + R12b 未来 4 节可用窗。
export async function checkClassCreate(
  client: Db,
  input: { teacherId: number; weekday: number; startMin: number; endMin: number },
  excludeClassId?: number
) {
  if (input.startMin < 0 || input.endMin > 1440 || input.startMin >= input.endMin) {
    throw new RuleError("BAD_TIME", "上课时间无效");
  }
  await checkTeacherConflict(client, input.teacherId, input.weekday, input.startMin, input.endMin, excludeClassId);
  await checkAvailabilityHorizon(client, input);
}

// 调班校验：R2 恒查；时间或教师变更才查 R12b（只改容量不必要求教师补登记未来档期）
// + 改动时间后在读学生不得与其他班冲突（R1）+ 容量不得低于现有占用（R7 逆向）
export async function checkClassEdit(
  client: Db,
  classId: number,
  next: { teacherId: number; weekday: number; startMin: number; endMin: number; capacity: number },
  current: { teacherId: number; weekday: number; startMin: number; endMin: number; capacity: number }
) {
  if (next.startMin < 0 || next.endMin > 1440 || next.startMin >= next.endMin) {
    throw new RuleError("BAD_TIME", "上课时间无效");
  }
  await checkTeacherConflict(client, next.teacherId, next.weekday, next.startMin, next.endMin, classId);
  const timeOrTeacherChanged =
    next.weekday !== current.weekday || next.startMin !== current.startMin ||
    next.endMin !== current.endMin || next.teacherId !== current.teacherId;
  if (timeOrTeacherChanged) {
    await checkAvailabilityHorizon(client, next);
    const roster = await client.studentTime.findMany({ where: { classId, status: "ACTIVE" }, select: { userId: true } });
    const rosterIds = roster.map((r) => r.userId);
    if (rosterIds.length > 0) {
      const others = await client.studentTime.findMany({
        where: { userId: { in: rosterIds }, status: "ACTIVE", classId: { not: classId } },
        include: { class: { select: { name: true, weekday: true, startMin: true, endMin: true } }, user: { select: { name: true } } },
      });
      const conflicts = new Set<string>();
      for (const st of others) {
        if (st.class.weekday === next.weekday && overlaps(st.class.startMin, st.class.endMin, next.startMin, next.endMin)) {
          conflicts.add(`${st.user.name}（${st.class.name}）`);
        }
      }
      if (conflicts.size > 0) {
        throw new RuleError("R1_CONFLICT", `改时间会让在读学生冲突：${[...conflicts].slice(0, 3).join("、")}${conflicts.size > 3 ? " 等" : ""}`);
      }
    }
  }
  if (next.capacity !== current.capacity) {
    const rosterCount = await client.studentTime.count({ where: { classId, status: "ACTIVE" } });
    if (next.capacity < rosterCount) throw new RuleError("R7_CAPACITY", `容量不能低于在读人数（${rosterCount}）`);
    const today = melbourneToday();
    const futureLessons = await client.lesson.findMany({ where: { classId, date: { gte: today } }, select: { classId: true, date: true } });
    for (const l of futureLessons) {
      const occ = await lessonOccupancy(client, classId, l.date);
      if (occ.total > next.capacity) throw new RuleError("R7_CAPACITY", `${l.date} 的课节已有 ${occ.total} 人占用，容量不能低于它`);
    }
  }
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
