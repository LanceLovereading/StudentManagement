// 种子数据：为「一张试听券的一生」演示铺齐所有状态。
// 三个数字开箱即有戏：待跟进（tried+ATTENDED 未跟进）、待续费（ending）、唤醒（churning）；
// 另铺：满班（Year 6 English 容量 2 已满，R7 拒绝）、冲突（王小宝在 Selective Program，试数学撞 R1）、
//       过期券（罗盘，R9 拒绝）、NOSHOW 券（可重发）、双班学生（林晨：VCE Chemistry + UCAT）。
// 班级体系对齐 austineducation.com.au：VCE 按学科 Units 1–4、Year 分层班、Selective Entry（Y8–9）、UCAT（纯线上）。
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, melbourneToday, nextOccurrence, weekdayOf } from "../src/lib/time";

const db = new PrismaClient();
const hash = (p: string) => bcrypt.hashSync(p, 8);
const DAY = 864e5;
const today = melbourneToday();

// 班级学期：VCE Units 是学年班（官网口径 Units 1–4 跨学期），这里取"开学于 11 周前、
// 结束于 8 周后"的学年班——既覆盖出勤历史的回溯周数，也保证未来 4 节（R7/R12b 展望期）有得排。
const monday = addDays(today, -(weekdayOf(today) - 1));
const termStart = addDays(monday, -77);
const termEnd = addDays(monday, 55);
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

// Prisma 不直接支持部分唯一索引，这里手工建（R8 / student_time ACTIVE 唯一，见 README）
const PARTIAL_INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS one_open_trial_per_user ON "Voucher"("userId") WHERE kind = 'TRIAL' AND status IN ('ISSUED','REDEEMED')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS active_enrollment_per_class ON "StudentTime"("userId", "classId") WHERE status = 'ACTIVE'`,
];

type Spec = {
  name: string;
  phone: string;
  admin: "amy" | "ben";
  status: "new" | "tried" | "subscribed" | "ending" | "churning";
  statusChangedDaysAgo?: number;
  enroll?: { cls: string; weeks: number }[];
  targetBalance?: number; // 全部出勤记完后的最终余额
  grant?: number;
  voucher?: {
    kind: string;
    subject?: string;
    status: string;
    issuedDaysAgo: number; // 有效期 = 发放起 30 天
    outcomeNote?: string;
    source?: string;
    followedUpDaysAgo?: number;
    redeemInto?: string; // 兑换进的班名（next occurrence）
  };
};

const AMY: Spec[] = [
  { name: "张小弟", phone: "0401000001", admin: "amy", status: "tried", statusChangedDaysAgo: 3,
    voucher: { kind: "TRIAL", subject: "Maths Methods", status: "ATTENDED", issuedDaysAgo: 10, outcomeNote: "基础扎实，互动积极，家长在场陪同", source: "大众点评" } },
  { name: "李小妹", phone: "0401000002", admin: "amy", status: "tried", statusChangedDaysAgo: 2,
    voucher: { kind: "TRIAL", subject: "English", status: "ATTENDED", issuedDaysAgo: 12, outcomeNote: "口语好，语法弱", followedUpDaysAgo: 1 } },
  { name: "王小宝", phone: "0401000003", admin: "amy", status: "subscribed",
    enroll: [{ cls: "Selective Entry Program (Y8-9)", weeks: 0 }], targetBalance: 5,
    voucher: { kind: "TRIAL", subject: "Maths", status: "ISSUED", issuedDaysAgo: 2, source: "小红书" } },
  { name: "赵小虎", phone: "0401000004", admin: "amy", status: "new",
    voucher: { kind: "TRIAL", subject: "Chemistry", status: "REDEEMED", issuedDaysAgo: 5, redeemInto: "VCE Chemistry U3&4" } },
  { name: "陈小明", phone: "0401000005", admin: "amy", status: "subscribed",
    enroll: [{ cls: "VCE Maths Methods U1&2", weeks: 6 }], targetBalance: 6 },
  { name: "陈小红", phone: "0401000006", admin: "amy", status: "subscribed",
    enroll: [{ cls: "VCE English/EAL U1&2", weeks: 8 }], targetBalance: 8, grant: 2 },
  { name: "周天乐", phone: "0401000007", admin: "amy", status: "ending", statusChangedDaysAgo: 5,
    enroll: [{ cls: "VCE Maths Methods U1&2", weeks: 8 }], targetBalance: 3 },
  { name: "吴优", phone: "0401000008", admin: "amy", status: "ending", statusChangedDaysAgo: 3,
    enroll: [{ cls: "Year 6 English & Writing", weeks: 6 }], targetBalance: 2 },
  { name: "郑安琪", phone: "0401000009", admin: "amy", status: "churning", statusChangedDaysAgo: 20,
    enroll: [{ cls: "VCE Chemistry U3&4", weeks: 10 }], targetBalance: 0, grant: 1 },
  { name: "孙悦", phone: "0401000010", admin: "amy", status: "subscribed",
    enroll: [{ cls: "VCE Chemistry U3&4", weeks: 5 }], targetBalance: 10,
    voucher: { kind: "RESCHEDULE", status: "REDEEMED", issuedDaysAgo: 2, redeemInto: "VCE Maths Methods U1&2" } },
  { name: "林晨", phone: "0401000011", admin: "amy", status: "subscribed",
    enroll: [{ cls: "VCE Chemistry U3&4", weeks: 4 }, { cls: "UCAT · Online", weeks: 4 }], targetBalance: 7 },
  { name: "何雨", phone: "0401000012", admin: "amy", status: "new" },
];

const BEN: Spec[] = [
  { name: "冯乐天", phone: "0402000001", admin: "ben", status: "tried", statusChangedDaysAgo: 6,
    voucher: { kind: "TRIAL", subject: "Maths", status: "ATTENDED", issuedDaysAgo: 13, outcomeNote: "计算粗心，家长希望周末班" } },
  { name: "顾小舟", phone: "0402000002", admin: "ben", status: "subscribed",
    enroll: [{ cls: "VCE Maths Methods U1&2", weeks: 7 }], targetBalance: 11,
    voucher: { kind: "RESCHEDULE", status: "ISSUED", issuedDaysAgo: 1 } },
  { name: "韩梅", phone: "0402000003", admin: "ben", status: "subscribed",
    enroll: [{ cls: "VCE English/EAL U1&2", weeks: 9 }], targetBalance: 5 },
  { name: "曹阳", phone: "0402000004", admin: "ben", status: "ending", statusChangedDaysAgo: 6,
    enroll: [{ cls: "VCE Chemistry U3&4", weeks: 9 }], targetBalance: 1 },
  { name: "许诺", phone: "0402000005", admin: "ben", status: "churning", statusChangedDaysAgo: 25,
    enroll: [{ cls: "Year 8 Maths", weeks: 10 }], targetBalance: 0 },
  { name: "石磊", phone: "0402000006", admin: "ben", status: "subscribed",
    enroll: [{ cls: "VCE Chemistry U3&4", weeks: 6 }], targetBalance: 13 },
  { name: "唐诗", phone: "0402000007", admin: "ben", status: "subscribed",
    enroll: [{ cls: "Year 6 English & Writing", weeks: 5 }], targetBalance: 9 },
  { name: "秦朗", phone: "0402000008", admin: "ben", status: "new",
    voucher: { kind: "TRIAL", subject: "English", status: "ISSUED", issuedDaysAgo: 3, source: "转介绍" } },
  { name: "茜茜", phone: "0402000009", admin: "ben", status: "new",
    voucher: { kind: "TRIAL", subject: "Maths", status: "NOSHOW", issuedDaysAgo: 15, outcomeNote: "约了没来，可重发" } },
  { name: "高远", phone: "0402000010", admin: "ben", status: "subscribed",
    enroll: [{ cls: "Year 8 Maths", weeks: 8 }], targetBalance: 6 },
  { name: "罗盘", phone: "0402000011", admin: "ben", status: "new",
    voucher: { kind: "TRIAL", subject: "Maths", status: "EXPIRED", issuedDaysAgo: 40 } },
  { name: "万绮雯", phone: "0402000012", admin: "ben", status: "subscribed",
    enroll: [{ cls: "VCE Maths Methods U1&2", weeks: 5 }], targetBalance: 14 },
];

const CLASSES = [
  { name: "VCE Maths Methods U1&2", subject: "Maths Methods", yearLevel: 11, teacher: "王老师", weekday: 3, startMin: 990, endMin: 1080, capacity: 12 }, // 周三 16:30-18:00
  { name: "Year 8 Maths", subject: "Maths", yearLevel: 8, teacher: "王老师", weekday: 6, startMin: 840, endMin: 930, capacity: 12 },   // 周六 14:00-15:30（与 Selective 重叠→R1 演示）
  { name: "VCE English/EAL U1&2", subject: "English", yearLevel: 11, teacher: "李老师", weekday: 4, startMin: 990, endMin: 1110, capacity: 12 }, // 周四 16:30-18:30
  { name: "VCE Chemistry U3&4", subject: "Chemistry", yearLevel: 12, teacher: "陈老师", weekday: 6, startMin: 600, endMin: 720, capacity: 12 },  // 周六 10:00-12:00
  { name: "Year 6 English & Writing", subject: "English", yearLevel: 6, teacher: "李老师", weekday: 7, startMin: 600, endMin: 720, capacity: 2 }, // 周日 10:00-12:00（满班演示）
  { name: "Selective Entry Program (Y8-9)", subject: "Selective", yearLevel: 9, teacher: "刘老师", weekday: 6, startMin: 840, endMin: 960, capacity: 12 }, // 周六 14:00-16:00（与 Year 8 Maths 重叠→R1 演示）
  { name: "UCAT · Online", subject: "UCAT", yearLevel: 12, teacher: "陈老师", weekday: 5, startMin: 1020, endMin: 1140, capacity: 10 }, // 周五 17:00-19:00（站点口径：UCAT 纯线上）
];

async function main() {
  for (const m of ["orderLesson", "caiwu", "lessonFeedback", "voucher", "order", "studentParent", "parent", "studentTime", "lesson", "teacherTime", "classTemplate", "class", "user", "admin", "teacher"] as const) {
    await (db as any)[m].deleteMany();
  }
  for (const sql of PARTIAL_INDEXES) await db.$executeRawUnsafe(sql);

  const adminRow = {
    admin: await db.admin.create({ data: { name: "admin", passwordHash: hash("admin123"), level: "SENIOR" } }),
    amy: await db.admin.create({ data: { name: "amy", passwordHash: hash("amy123"), level: "JUNIOR" } }),
    ben: await db.admin.create({ data: { name: "ben", passwordHash: hash("ben123"), level: "JUNIOR" } }),
  };

  const teachers: Record<string, number> = {};
  for (const [name, phone] of [
    ["王老师", "0499000001"],
    ["李老师", "0499000002"],
    ["陈老师", "0499000003"],
    ["刘老师", "0499000004"],
  ] as [string, string][]) {
    const t = await db.teacher.create({ data: { name, phone, passwordHash: hash("teach123") } });
    teachers[name] = t.id;
  }

  const classes: Record<string, { id: number; weekday: number }> = {};
  for (const c of CLASSES) {
    const row = await db.class.create({
      data: { name: c.name, subject: c.subject, yearLevel: c.yearLevel, teacherId: teachers[c.teacher], weekday: c.weekday, startMin: c.startMin, endMin: c.endMin, capacity: c.capacity, startDate: termStart, endDate: termEnd },
    });
    classes[c.name] = { id: row.id, weekday: c.weekday };
    // 下一节：兑换预览与学生端"下节课"的容量分母
    await db.lesson.create({ data: { classId: row.id, date: nextOccurrence(c.weekday, today), status: "SCHEDULED" } });
  }

  // 班级模板的创建移到 classes 循环之后（TEMPLATES 定义在那里，窗口生成也已覆盖模板时段）。

  // 班级模板（下学期开班的骨架，时间刻意避开同师已有班）：
  // Specialist Maths 周六 11:00-12:30（王老师，与 Year 8 Maths 14:00 不撞）；
  // Scholarship Program 周日 13:00-15:00（刘老师）。可用窗按"班+模板"的时段生成，
  // 所以两个模板都能直接开班；换到没登记的星期几才会触发 R12。
  const TEMPLATES = [
    { name: "VCE Specialist Maths U3&4", subject: "Specialist Maths", yearLevel: 12, teacher: "王老师", weekday: 6, startMin: 660, endMin: 750, capacity: 10 },
    { name: "Scholarship Program (Y5-7)", subject: "Scholarship", yearLevel: 6, teacher: "刘老师", weekday: 7, startMin: 780, endMin: 900, capacity: 12 },
  ];
  for (const t of TEMPLATES) {
    await db.classTemplate.create({
      data: { name: t.name, subject: t.subject, yearLevel: t.yearLevel, teacherId: teachers[t.teacher], weekday: t.weekday, startMin: t.startMin, endMin: t.endMin, capacity: t.capacity },
    });
  }

  // 教师可用时间 = 具体日期 + 时段（R12）：班与模板未来 6 节的日期各登记一个覆盖窗
  //（比时段前后各宽 60 分钟——真实档期比排课粗）。R12b 建班/调班校验未来 4 节，6 周留有余量。
  for (const c of [...CLASSES, ...TEMPLATES]) {
    const first = nextOccurrence(c.weekday, today);
    for (let i = 0; i < 6; i++) {
      await db.teacherTime.create({
        data: { teacherId: teachers[c.teacher], date: addDays(first, 7 * i), startMin: c.startMin - 60, endMin: c.endMin + 60 },
      });
    }
  }

  const bal = new Map<number, number>();
  async function ledger(userId: number, delta: number, reason: string, ref: string, byAdminId: number, status?: string, createdAt?: Date) {
    const balanceAfter = (bal.get(userId) ?? 0) + delta;
    bal.set(userId, balanceAfter);
    await db.caiwu.create({ data: { userId, delta, reason, status, ref, balanceAfter, byAdminId, ...(createdAt ? { createdAt } : {}) } });
  }

  let seq = 0;
  for (const spec of [...AMY, ...BEN]) {
    const owner = spec.admin === "amy" ? adminRow.amy : adminRow.ben;
    const u = await db.user.create({
      data: { name: spec.name, phone: spec.phone, passwordHash: hash("demo1234"), ownerAdminId: owner.id, status: "new" },
    });

    // 先一次性购课（购买 = 总出勤 + 目标余额 − 赠送），再逐班逐周出勤
    const enrollments = spec.enroll ?? [];
    const totalWeeks = enrollments.reduce((s, e) => s + e.weeks, 0);
    if (spec.targetBalance != null) {
      const purchase = totalWeeks + spec.targetBalance - (spec.grant ?? 0);
      if (purchase > 0) {
        const order = await db.order.create({
          data: {
            userId: u.id, subject: enrollments[0] ? CLASSES.find((c) => c.name === enrollments[0].cls)!.subject : null,
            hours: purchase, amountCents: purchase * 45000, status: "PAID",
            paidAt: daysAgo(totalWeeks * 7 + 1), createdByAdminId: owner.id, createdAt: daysAgo(totalWeeks * 7 + 1),
          },
        });
        seq++;
        await ledger(u.id, purchase, "PURCHASE", `order:${order.id}`, owner.id, undefined, daysAgo(totalWeeks * 7 + 1));
      }
      if (spec.grant) await ledger(u.id, spec.grant, "GRANT", `manual:seed-g${seq}`, owner.id, undefined, daysAgo(totalWeeks * 7));
      for (const e of enrollments) {
        const cls = classes[e.cls];
        await db.studentTime.create({ data: { userId: u.id, classId: cls.id, status: "ACTIVE", startedAt: daysAgo(e.weeks * 7) } });
        for (let w = 1; w <= e.weeks; w++) {
          const date = addDays(nextOccurrence(cls.weekday, today), -7 * w);
          const lesson = await db.lesson.upsert({
            where: { classId_date: { classId: cls.id, date } },
            create: { classId: cls.id, date, status: "DONE" },
            update: { status: "DONE" },
          });
          await ledger(u.id, -1, "ATTENDANCE", `lesson:${lesson.id}`, owner.id, "PRESENT", daysAgo(7 * w));
        }
      }
    } else if (enrollments.length > 0) {
      for (const e of enrollments) {
        await db.studentTime.create({ data: { userId: u.id, classId: classes[e.cls].id, status: "ACTIVE" } });
      }
    }

    if (spec.voucher) {
      const v = spec.voucher;
      const voucher = await db.voucher.create({
        data: {
          userId: u.id, kind: v.kind, subject: v.subject, status: v.status,
          validUntil: daysAhead(30 - v.issuedDaysAgo),
          issuedBy: owner.id, outcomeNote: v.outcomeNote,
          followedUpAt: v.followedUpDaysAgo ? daysAgo(v.followedUpDaysAgo) : null,
          createdAt: daysAgo(v.issuedDaysAgo),
        },
      });
      if (v.redeemInto) {
        const cls = classes[v.redeemInto];
        const date = nextOccurrence(cls.weekday, today);
        const lesson = await db.lesson.upsert({
          where: { classId_date: { classId: cls.id, date } },
          create: { classId: cls.id, date, status: "SCHEDULED" },
          update: {},
        });
        await db.orderLesson.create({ data: { lessonId: lesson.id, studentId: u.id, voucherId: voucher.id } });
      }
    }

    await db.user.update({
      where: { id: u.id },
      data: { status: spec.status, ...(spec.statusChangedDaysAgo ? { statusChangedAt: daysAgo(spec.statusChangedDaysAgo) } : {}) },
    });
  }

  // 家长：多对多，王芳带两个孩子（多孩家庭演示）
  const userIdByName = new Map((await db.user.findMany({ select: { id: true, name: true } })).map((u) => [u.name, u.id]));
  for (const [pname, phone, kids] of [
    ["张爸爸", "13900000001", [["张小弟", "FATHER", true]]],
    ["王芳", "13900000002", [["王小宝", "MOTHER", true], ["何雨", "MOTHER", false]]],
    ["李妈妈", "13900000003", [["李小妹", "MOTHER", true]]],
  ] as [string, string, [string, string, boolean][]][]) {
    const parent = await db.parent.create({ data: { name: pname, phone, passwordHash: hash("parent123") } });
    for (const [kid, relation, isPrimary] of kids) {
      const studentId = userIdByName.get(kid)!;
      await db.studentParent.create({ data: { studentId, parentId: parent.id, relation, isPrimary } });
    }
  }

  const counts = {
    users: await db.user.count(), vouchers: await db.voucher.count(), caiwu: await db.caiwu.count(),
    lessons: await db.lesson.count(), orders: await db.order.count(), parents: await db.parent.count(), tried: await db.user.count({ where: { status: "tried" } }),
    ending: await db.user.count({ where: { status: "ending" } }), churning: await db.user.count({ where: { status: "churning" } }),
  };
  console.log("seeded:", counts);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
