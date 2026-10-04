# WALKTHROUGH · 单功能实现全解：一张试听券的一生

Part B 的核心主张：对一个完整功能，从前端入口到数据库约束的每一层都有完整的掌控。本文沿一张试听券走完它的一生——**发券 → 兑换（约课）→ 试听出勤 → 跟进 → 转化**——每一步都给出：入口在哪个页面、请求打到哪个接口、规则在哪一层执行、事务里写了哪些行、失败时调用方看到什么。所有文件路径真实存在，函数名可以直接搜；规则编号对应 [DESIGN.md](DESIGN.md) §4。

券的状态机就是业务流程，每个箭头是一个接口：

```
            发券               兑换(约一节)            试听结果               转化(R10)
 new ──→ ISSUED ──────→ REDEEMED ──────→ ATTENDED ──────→ CONVERTED
            │                │                 │                    └─→ 学生 subscribed
            │                │                 └─ 学生 new→tried ──→ 进跟进队列
            │                └─ 缺勤 → NOSHOW（券作废、可重发）
            └─ 30 天过期 → EXPIRED（每日扫描；兑换接口兜底再判一次）
```

## 0. 文件地图

| 层 | 文件 | 职责 |
|---|---|---|
| 页面 | `src/app/admin/students/[id]/page.tsx` | 学生详情：发券、试听结果、转化、收款都在这里 |
| 页面 | `src/app/admin/vouchers/[id]/redeem/page.tsx` | 兑换预告：逐班 ✓/✕ + 余位 |
| 页面 | `src/app/admin/page.tsx` | 工作台：三队列 + 起草话术 / 标记跟进 |
| 组件 | `src/components/student-forms.tsx` | `IssueVoucherForm` / `ResultButtons` / `ConvertForm` 等 |
| 组件 | `src/components/DraftBox.tsx` · `FollowedButton.tsx` | 起草跟进话术 / 标记已跟进 |
| 接口 | `src/app/api/vouchers/`（route + `[id]/redeem·result·followed·convert`） | 券的五个写入口 |
| 接口 | `src/app/api/lessons/[id]/rollcall/route.ts` | 点名提交 |
| 接口 | `src/app/api/draft/route.ts` | LLM 起草 |
| 规则 | `src/lib/rules.ts` | `checkSingleRedeem` / `findSingleLessonConflict` / `lessonOccupancy` / `checkEnroll` |
| 账本 | `src/lib/ledger.ts` | `writeCaiwu`（幂等）+ `recomputeLifecycle` |
| 扫描 | `src/lib/scan.ts` | `runDailyScan` + 三个队列（都是查询） |
| 权限 | `src/lib/session.ts` | `assertStudentVisible` / `assertVoucherVisible`（R6） |
| 分发 | `src/lib/rollcall.ts` | `dispatchAttendance`（在读/补课/试听三分支） |

## 1. 发券：营销动作的入口（R6 / R8 / R9）

**入口**：工作台花名册搜索 → 学生详情页「发试听券」（`IssueVoucherForm`）→ `POST /api/vouchers`。

服务端按序做三件事（`src/app/api/vouchers/route.ts`）：

1. **R6**：`assertStudentVisible`——junior 只能给自己名下的学生发券；跨范围的请求先于一切业务检查被拒（学生不可见 → NOT_FOUND，越权 → FORBIDDEN）。
2. **R8**：查该学生是否已有 `status ∈ {ISSUED, REDEEMED}` 的 TRIAL 券，有则 `R8_DUP_TRIAL`。想试别的科目？听完当前券再发——一张未完结券占住"待试听"心智，防止学生同时挂三张券、跟进彻底失效。
3. **R9**：`validUntil = now + 30 天` 写进券本身——有效期是券的属性，不是悬在系统里的全局规则。

**最后一道防线在数据库**：R8 的应用层预检只是友好报错，真正不可绕过的是 seed 里的部分唯一索引 `one_open_trial_per_user`（每学生 `status ∈ {ISSUED, REDEEMED}` 的 TRIAL 券至多一行）。绕过 API 直接写库，第二张券同样被 DB 拒绝（P2002 → 统一映射为 `DUPLICATE`）。规则执行层的完整分工：能数据库兜底的都兜底，应用层负责把"为什么不行"说成人话。

## 2. 兑换：预告即裁决（R9 → R1 → R7 → R13）

**入口**：学生详情页券行的「去兑换」→ `/admin/vouchers/[id]/redeem`。

兑换页是服务端渲染的**预告**：列出该科目所有 OPEN 的班，逐班调 `checkSingleRedeem`（`src/lib/rules.ts`），得到 ✓（余位）/ ✕（原因 + 给人看的原因话）。关键设计：**预告与提交用同一个校验函数**——不存在第二套标准，也就不存在"预告能过、提交被拒"的口径漂移。科目不匹配的班根本不进列表；学期已结束的班会进列表但判 `CLASS_ENDED`——教务能看到"为什么不能约"，而不是选项凭空消失。

点击「兑换」→ `POST /api/vouchers/[id]/redeem`，同一个 `checkSingleRedeem` 在**事务内重跑**（预告只是预览，提交才是裁决）：

```ts
db.$transaction(async (tx) => {
  await checkSingleRedeem(tx, voucher.userId, cls, date);  // 班级状态 + 学期边界 + R1 + R7
  const lesson = await tx.lesson.upsert(...);              // R13：课节现场物化
  await tx.orderLesson.create(...);                        // 单节占位（试听席）
  await tx.voucher.update(... { status: "REDEEMED" });     // 券推进
});
```

四个细节是这段的核心：

- **R13 物化**：班是周循环（weekday + startMin/endMin），lesson 是某周的具体一节。兑换时目标 (class, date) 不存在就现场从周循环创建——**"预约"这个动作让课节存在**，而不是等定时任务先铺好。`runDailyScan` 里另有一个"查看时补建"的兜底，保证点名页、学生课表总有稳定可链接的下一节（学期结束的班不再物化，`date > endDate` 跳过）。
- **date 从哪来**：`nextOccurrence(cls.weekday, melbourneToday())`——班的下一次课。全程 "YYYY-MM-DD" 字符串比较，无时区换算。
- **R1 的单节版**（`findSingleLessonConflict`）：既查周循环班（ACTIVE student_time），也查同一天已有的单节预约（order_lesson）——学生已报周六班，再约同周六另一节试听，一样被拦，冲突来源（班名）直接进错误消息。
- **R7 占位同池**（`lessonOccupancy`）：单节占用 = 周循环名单 + order_lesson 占位行。试听、补课和正式学生抢的是同一个座位池——试听占真席位，不虚挂"额外名额"。

**失败长什么样**：`R1_CONFLICT` / `R7_FULL` / `R9_EXPIRED` / `CLASS_ENDED` / `CLASS_CLOSED`，每个都是机器可读原因码 + 一句人话。过期券在提交时会被顺手置为 EXPIRED（读路径顺手把状态修对）。

## 3. 试听出勤：两条路，一个守卫（R14）

试听结束有两种录入方式，收敛到同一个状态迁移：

- **admin 手动**：学生详情页 `ResultButtons` → `POST /api/vouchers/[id]/result`（ATTENDED / NOSHOW + 一句反馈写进 `outcomeNote`）；
- **教师点名**：点名操作台把试听学生一起点了 → `POST /api/lessons/[id]/rollcall` → `dispatchAttendance` 的试听分支（`src/lib/rollcall.ts`）。

两条路的守卫都是**券状态本身**：只有 REDEEMED 的券能推进，重复提交返回幂等的 `already`。ATTENDED 时若学生还是 `new`，同事务推到 `tried`（R14 事件迁移——状态只由服务端驱动，没有手工改状态的入口）；NOSHOW 则券作废、R8 的"未完结"窗口随之空出，可以重发。**试听全程不写 caiwu——"试听免费"是账本上可见的事实，不是页面上的免单按钮。**

## 4. 跟进：队列是查询，不是 todo 表（R14 / R6）

试听一结束，跟进项自动出现——**没有谁"创建"过一条跟进任务**。工作台加载 → `getFollowupQueue`（`src/lib/scan.ts`）：

```ts
where: { status: "tried", ...scope,
          vouchers: { some: { kind: "TRIAL", status: "ATTENDED",
                              OR: [{ followedUpAt: null },
                                   { followedUpAt: { gte: since } }] } } }
```

"该联系谁"是状态的函数：tried + 有 ATTENDED 且未跟进的券 = 进队列；`scope` 就是 R6 的行级过滤（junior 只见自己的学生）。试听后超 48h（`FOLLOWUP_HOURS`，可配置假设值）标"超时"。「标记已跟进」只写一个 `followedUpAt` 时间戳，条目**弱化保留 7 天**（`FOLLOWED_VISIBLE_DAYS`）再自然出队——跟进是留痕，不是勾选后蒸发。

**LLM 落点在这里**：队列行的「起草跟进」→ `POST /api/draft`。服务端把学生上下文（试听科目、老师反馈、当前有余位的建议班次）组包发给 LLM，要求返回 `{message, suggestedClass, riskTag}`，zod 校验通过才返回 `degraded:false`；未配置 / 超时（30s）/ 格式不符 → `degraded:true`，前端出空白话术框，**跟进流程照常完成**。suggestedClass 不是让模型拍脑袋：候选班次和余位是服务端查出来塞进上下文的，模型只负责组织语言。

## 5. 转化：一个事务，四张表（R10 / R1 / R3 / R7）

**入口**：跟进队列（或学生详情页）的「转化」→ `ConvertForm` → `POST /api/vouchers/[id]/convert`。

```ts
db.$transaction(async (tx) => {
  await writeCaiwu(tx, { delta: hours, reason: "PURCHASE", ... });  // ① 充值入账
  await checkEnroll(tx, voucher.userId, classId);   // ② R1 / R3 / R7
  await tx.studentTime.create(...);                 // ③ 正式排班
  await tx.voucher.update(... { status: "CONVERTED" });  // ④ 券收尾
  await tx.orderLesson.deleteMany(...);             // ⑤ 占位交接
  await tx.user.update(... { status: "subscribed" });    // ⑥ 状态机
});
```

- **②里藏着一个时序决定**：`checkEnroll` 必须用事务内的 `tx` 调——转化先充值后排班，R3 余额门槛读到的必须是**事务内刚入账的余额**。用外层 `db` 读就会差一笔（这是容易写错、所以专门写进 `rules.ts` 注释的地方）。
- **⑤占位交接**：如果试听恰好约在要报的这个班，删掉该券的单节占位——正式名单（student_time 的周循环占用）已经表达了这一节，不删会同节双计。试听席 → 正式席，是同一个小节内的"户口迁移"；约在其他班的占位不受影响（那仍是一节真实的单节约课）。
- **重放防线**：同一转化请求重放，第二遍在①之前就被券状态守卫拦下（券已 CONVERTED → `R10_GUARD`）。R4 的 `unique(reason, userId, ref)` 幂等锚守护的是另一类路径——点名（ref=lesson:id）、订单（ref=order:id）这些 ref 固定的写入，同一事件最多记一笔。
- **失败原子**：余额够、但选的班满/冲突 → 整个事务回滚，不存在"充了钱却没报上课"的中间态；`writeCaiwu` 尾部的 `recomputeLifecycle` 也只在事务提交后对外可见。

## 6. 尾声：余额驱动的余生（R14 / R3）

转化之后，学生状态不再需要人管：每次账本写入，`writeCaiwu` 尾部顺带 `recomputeLifecycle`（余额 > 4 → subscribed，≤ 4 → ending，进续费队列）；ending 且余额 0 持续 14 天 → churning（每日扫描判定，进唤醒队列）。**生命周期是一条由"事务内事件迁移 + 每日扫描"共同驱动的管线，跟进/续费/唤醒三个队列全部是查询。**新需求"想看到期未续费的家长"= 写一个新查询，不是加一张新表——这就是"架构立住之后，剩下都是加模块"的具体含义。

## 7. 我清楚这套实现的边界（追问预演）

- **R7 的并发窗口**：占位检查是"读-验-写"，两个并发兑换在极端情况下可能同时通过满员校验（PostgreSQL 默认隔离级别下的经典竞态）。当前是单实例演示部署、教务操作天然串行；要多并发，加 `SELECT ... FOR UPDATE` 锁班级行即可，接口与页面不用动。
- **每日扫描由工作台加载触发、按实例节流**（`ensureDailyScan`，60s 内复用同一次执行，失败不阻塞页面）：幂等、无 cron 依赖；多实例部署时换成定时任务调同一个 `runDailyScan()`，队列逻辑不变。
- **LLM 只是辅助**：起草失败降级为空白框，任何状态下不阻塞流程——AI 的失败模式被关进"多打五分钟字"这个代价里。
- **会话与幂等的兜底分层**：应用层守卫（券状态、课节状态）给出友好原因码，DB 唯一索引（R8、R4）是绕过界面后的最后一道墙——两层缺一不可，只有前者可被绕过，只有后者报错不可读。
