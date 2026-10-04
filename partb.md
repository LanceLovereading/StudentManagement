# Part B · 切片实现与演示

Part A 全部七项（业务理解、范围取舍、数据模型、关键规则、假设与五个问题、页面与信息结构、切片选择理由）在 [DESIGN.md](DESIGN.md)；单个功能从前端到数据库的完整实现解剖见 [WALKTHROUGH.md](WALKTHROUGH.md)；运行与部署见 [README.md](README.md)。

## 1. 演示与破坏测试

演示脚本：admin 登录 → 录入学生 → 发试听券 → 兑换进下周某节数学课（现场触发 R1/R7 拒绝项）→ 标记试听结束（学生变 tried）→ 工作台提示需要跟进（跟进队列）→ LLM 起草跟进话术 → 家长同意 → 转化（充值入账 + 正式排班，同事务，学生变 subscribed）→ 以学生身份登录看我的课表收尾。种子铺好 ending/churning 学生，工作台"待续费/唤醒"数字开箱即有戏。

破坏测试（绕过界面直接打 API）：同科重复发券 → R8 拒绝；兑换冲突课 → R1 拒绝；兑换过期券 → R9 拒绝；未充值转化 → R10 拒绝；重复提交转化 → 状态守卫幂等；往满班塞人 → R7 拒绝。每个拒绝都带机器可读原因码。带真实输出的 curl 清单见 README「破坏测试」一节。

**LLM 落点：跟进话术起草**——这是"试听完没人跟进"痛点的直接解法：admin 不缺信息、缺的是把信息组织成一段得体话术的 5 分钟。structured output（zod 校验：话术正文 + 建议班次 + 风险标签）；**LLM 失败时降级为空白话术框，跟进流程照常完成**——券的状态机不依赖 LLM。

## 2. 技术栈

Next.js（App Router）+ TypeScript 全栈；Prisma + PostgreSQL（Neon 就绪，本地任意 Postgres 均可）；credentials + session 登录（admin → 工作台，user → 我的课表（只读），teacher → 点名/可用时间，parent → 只读门户），ADMIN 角色中间件 + 行级过滤实现 R6；seed 脚本生成 1 senior + 2 junior admin、24 名学生、4 名教师、3 位家长、7 个固定班（对齐 austineducation.com.au 课程体系：VCE Maths Methods / English & EAL / Chemistry 按 Units、Year 分层班、Selective Entry Y8-9、UCAT 纯线上；含下周 Lesson）、多种状态的券、几笔手工充值流水、余额 0~15 不等的账本——保证工作台三个数字都有戏可演。时区：Class 存 weekday + 本地时间，Lesson.date 按 `Australia/Melbourne` 生成，全程不做时区换算。部署 Vercel，README 附链接。

## 3. 附录（原 SCHEMA.md 收编）

### 冲突检查（R1）怎么跑

新 booking（class 的 weekday + start_min/end_min）与学生所有 `ACTIVE` 的 student_time → class 对比：同 weekday 且 `start_min < 对方.end_min AND end_min > 对方.start_min` → 拒绝，错误码返回重叠的那节课。券兑换（单节）同理：取该 lesson 的 weekday/时间对齐比较。教师侧：可用窗是**具体日期 + 时段**（teacher_time.date），建班/调班校验未来 4 节的日期逐日有覆盖窗，且不与该教师其他班重叠。**全程 int 比较，无时区换算。**

### 面试追问预演（每条都能落到表上）

- **"学生同时在两个班怎么办？"** — student_time 允许多行，冲突只按时间轴判（R1）；不重叠即合法
- **"课时怎么退？"** — order 标 REFUNDED + caiwu 反向条目（REFUND, ref=order），不删不改任何历史
- **"一个家长两个孩子 / 孩子有多位家长？"** — student_parent 多对多，is_primary 决定默认联系人
- **"谁付的钱？"** — order.parent_id；上课的人和付钱的人从一开始就是两条记录
- **"老师临时请假一周？"** — 该周 lesson 标 CANCELLED，不产生扣减；那一周不登记可用窗，就不会被再排
- **"学生转给另一个 admin？"** — user.owner_admin_id 改外键 + 操作留痕；跟进中的券跟学生走
- **"同一节课点了两次名？"** — caiwu unique(reason, user_id, ref_id)：第二次插入直接失败
- **"学生缺勤了还扣吗？怎么补课？"** — 直接扣费并在出勤流水标 NOSHOW；admin 发 RESCHEDULE 补课券，兑换进任一有位课节，**补课出勤照常扣课时**（每一次实际授课都有成本）；是否另赠课时由 admin 用 GRANT 决定
- **"赠送的课时从哪来？"** — GIFT_HOURS 券兑换写 caiwu(+N, GRANT)，与充值同源，对账口径统一
- **"出勤率怎么算？"** — ATTENDANCE 行的 status 字段聚合；不需要出勤表

### 已知的代价（我们主动选择的）

出勤事实与扣减耦合在同一张表：点名页 = caiwu 写入器；"谁还没点名" = 名单 LEFT JOIN caiwu 的 NOT EXISTS 查询。可接受——如果未来反馈/考勤报表变复杂，再把事实表拆出去是一次单表迁移，不影响账本。

## 4. 后续模块（已并入——「架构立住之后，剩下都是加模块」的现场验证）

以「架构立住之后，剩下都是加模块」为验收：全部在不动既有表语义的前提下插入，没有为任何一个模块新立平行账本。

| 模块 | 落点 | 规则 |
|---|---|---|
| 点名/反馈操作台（教师端） | `/teacher/lessons/[id]`；分发逻辑 `lib/rollcall.ts`；「新入班」徽章 = 入班 ≤14 天，点名台直接回答"今天班里谁是新来的" | R4（幂等不穿透，逐生独立）、R11（照扣）、R14（事件迁移） |
| 教师登录 + 可上课时间 | `/teacher/availability`（按具体日期登记） | R12a 同师同日时段不重叠（int 比较） |
| 补课券跨班兑换 | 兑换页接受 RESCHEDULE，跨科目选班 | R11（预约权非免扣）、R13、R1/R7 |
| 赠送课时 | `/api/grant` → caiwu(+N, GRANT) | 与充值同源，对账统一 |
| 订单收款 | order 表启用：CREATED→PAID 同事务入账，REFUNDED 反冲 | 幂等 ref=order:<id>；退款不删历史 |
| 家长只读门户 | `/parent`，复用 `lib/view.ts` 课表视图 | 家长零写入口 |
| 人工排课 | `/admin/classes` 周历（撞时间的班 ≤2 并排分道，≥3 收敛为"N 个班同时段"块）+ 当日议程（`?date=`，逐班整行）+ 建班 + 从模板开班；`/admin/classes/[id]` 调班/停开/存为模板（仅 senior） | R2（教师不撞班，编辑时排除自身）、R12b（学期内未来 4 节逐日落在教师登记的具体日期可用窗内，缺哪天报哪天）、调班改时间自动校验在读学生不撞班（R1）、容量不低于现有占用（R7 逆向）；学期尽 → CLASS_ENDED；停开班拒绝新排班/兑换 |

新增账本归属口径：caiwu.byAdminId / byTeacherId 恰好其一（admin 记账 vs 教师点名扣减）。
点名分发是账本写入器的一处实现：在读学生与补课学生照扣（缺勤也照扣），试听学生免费走券状态机（出勤→ATTENDED/new→tried，缺席→NOSHOW 作废可重发）。
