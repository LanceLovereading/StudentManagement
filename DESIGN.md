# 学生管理系统 · 设计文档

Austin Education 全栈工程师技术作业 · Part A

> 一句话定位：机构的生意由两件事决定——**线索别漏掉，交付别出丑**。这个系统只负责这两件事，其他一切以后再加。

## 1. 我怎么理解这个业务

两个核心诉求，对应两种完全不同的技术机制：

| 支柱 | 业务含义 | 杀死的痛点 | 技术机制 |
|---|---|---|---|
| **完整性**（不漏） | 试听后有人跟、课时快完有人谈续订 | 试听完没人跟进、课时用完才发现没提醒 | **生命周期状态机 + 每日扫描队列**：学生状态机是主管线（user.status），每天扫描一遍生成当日待办，"该联系谁"是状态的函数而不是人的记性 |
| **稳定性**（不乱） | 排得上、有老师、人数合理、不冲突 | 学生被排进冲突班、老师撞车、班级爆满 | **不变量 + 事务**：冲突/容量/余额在服务端事务里强制，绕过界面也拦得住 |

补充信息：

1. **课时是钱。** 预付资产，每次扣减都是资金变动。必须是账本式（不可变、可追溯、可对账），不是一个随手改的数字字段。
2. **试听是市场动作，正式课是交付动作。** 试听免费、限次、目的是转化——它天生适合做成一张**券**：发出去、约掉、上完、跟进、转化，每个状态都可追踪可告警。
3. **家长和学生不是同一个人，数据上也不是同一行。** 上课的是学生，付钱与被沟通的是家长；一个家长常有多个孩子，一个孩子可能有多位家长。家长独立成表、关系表多对多连接——**设计已定稿，实现排在家长系统批次（v2）**；v1 联系走学生电话（实际多为家长手机）。
4. **冲突的本质是时间，不是数量。** 周六上午数学班、下午英文班完全正常。规则定义在时间轴上（重叠即冲突），不限制班数。
5. **机构的节奏是"周"。** 固定班 = 每周同一时间的循环课。Class（循环定义）与 Lesson（某周的具体一节）必须分开。
6. **反馈和点名第二版再做**。这是质量改进的关键，但初期完全可以继续线下完成。

## 2. 第一版做什么、不做什么（以及以后怎么加）

| 范围 | 内容 | 将来怎么加 |
|---|---|---|
| **做** | 试听券全生命周期、转化（充值入账+排班）、排班不变量、跟进/续费/唤醒派生队列、LLM 跟进起草、学生只读课表、点名/反馈操作台（教师端）、教师可用时间登记、补课券跨班兑换、赠送课时、订单收款、家长只读门户、人工排课（建班/调班/停开） | — |
| 不做 | 咨询登记全流程（渠道、市场来源分析） | 券上留 `source` 字段，CRM 报表后加 |
| 不做 | 在线支付与完整家长 CRM（parent / student_parent / order 已启用：家长只读门户上线，订单线下标记 PAID） | 接入支付网关时 order 挂支付回调，账本无需迁移 |
| 不做 | 家长门户 / 微信短信通知 | 队列已产出"该联系谁"，接触达渠道即可 |
| 不做 | 智能排课（自动分配算法）、多校区权限 | 人工排课已上线（建班/调班/停开，R2/R12b 强制）；算法排课是查询优化，不是新实体 |

## 3. 数据模型

```
登录角色: admin / teacher / user(学生)     [v2 加 parent]
  │ owner_admin_id
  ▼
Student(status: new→tried→subscribed→ending→churning)
  │ ──< student_parent >── Parent(付款/沟通)   [v2]
  │ └────< Voucher(TRIAL|GIFT|DISCOUNT|RESCHEDULE) >──── (subject)
  │        TRIAL: ISSUED→REDEEMED→ATTENDED→CONVERTED
  │                ↘ NOSHOW / EXPIRED   （试听出勤 = 券状态迁移）
  │
  ├──< student_time >──── Class (subject, year_level)
  │    (status: ACTIVE|DROPPED)  │  (weekday, start_min, end_min, capacity)
  │                              └──< Lesson (date, status)
  │                                    ▲
  ├──< order_lesson (lesson_id, student_id, order_id? | voucher_id?)
  │        预约关联：目标课节不存在则现场物化（R13）；券/订单的按节占用都走这里
  │
  ├──< Order(user_id, parent_id, …)   [v2]
  │        PAID ──> caiwu(+hours, PURCHASE, ref=order)
  │        [v1: admin 手工 caiwu(+hours, PURCHASE)，收款在线下]
  │
  └──< caiwu (delta, reason, status: PRESENT|NOSHOW, ref, balance_after)
             充值/扣减/赠送都是流水（缺勤照扣、无豁免）；幂等锚 unique(reason, user, ref)
```

- `user(id, name, phone, password_hash, owner_admin_id, status: new|tried|subscribed|ending|churning, status_changed_at)` — 学生；生命周期状态机见关键设计 1；phone 初期即家庭联系电话
- `parent(id, name, phone, password_hash)` — 家长 **〔v2〕**
- `student_parent(student_id, parent_id, relation, is_primary)` — 多对多 **〔v2〕**
- `admin(id, name, password_hash, level: SENIOR|JUNIOR)` — 教务两级权限 / `teacher(id, name, phone, password_hash)` — 教师（兼职），全员登录
- `class(id, name, subject, year_level, teacher_id, weekday, start_min, end_min, capacity=12)` — 每周循环的固定班
- `lesson(id, class_id, date, status)` — 按周循环、预约时按需生成的单节实例
- `order(id, user_id, parent_id, subject, hours, amount_cents, status, voucher_id, paid_at, created_by_admin_id)` — 购买记录 **〔v2〕**
- `order_lesson(id, lesson_id, student_id, order_id?, voucher_id?)` — 预约关联表：券/订单占了哪节课；目标 lesson 不存在则现场物化（v1 仅有券侧数据，order 侧 v2 启用）
- `student_time(id, user_id, class_id, status, started_at)` — 报名；ACTIVE 唯一 (user, class)
- `caiwu(id, user_id, delta, reason: PURCHASE|ATTENDANCE|GRANT|ADJUST|REFUND, status, ref, balance_after, by_admin_id, created_at)` — 唯一账本，部分唯一索引 (reason, user, ref)
- `voucher(id, user_id, kind: TRIAL|GIFT_HOURS|DISCOUNT|RESCHEDULE, subject, status, valid_until, redeemed_lesson_id, source)` — 每学生同时仅一张未完结 TRIAL 券（部分唯一索引，不分科目）
- `teacher_time(id, teacher_id, date, start_min, end_min)` — 兼职教师的可用窗，**具体日期 + 时段**（档期按天变动，非周几循环）

**四个关键设计：**

1. **学生生命周期状态机就是跟进管线**。`user.status: new → tried → subscribed → ending → churning`——new 新录入；tried 试听过待转化；subscribed 在读；ending 课时将尽（余额≤4）；churning 已过期、需要唤醒营销。迁移只由服务端驱动：录入→new，试听出勤→tried，转化→subscribed，每次账本写入重算 ending（阈值≤4）。**每天扫描一遍**：tried 超 48h 的进当日跟进队列，余额 0 超 14 天的 ending 判入 churning——"该联系谁"是状态的函数，不是人的记性。券的状态机（ISSUED→REDEEMED→…）退为单笔交易的子管线，负责单张券的规则与走向。
2. **队列由每日扫描生成，不是手工维护的 todo 表**。每天扫一遍：tried 超 48h 的进跟进队列，ending 进续费队列，churning 进唤醒队列。没有 todo 表——这就是"架构立住之后，剩下都是加模块"成立的原因：新业务诉求大多是新查询或扫描规则，不是新实体。
3. **学生–admin 是归属关系**：senior 可读写全员；junior 仅读写自己名下学生（跨班只见余位数）；转 admin = 改外键 + 留痕，历史跟学生走。
4. **课时与出勤共用账本**：余额可推导，每笔变动（购课 +10、出勤 −1、赠送 +N）不可变、带 `balance_after` 快照；出勤事实就是 ATTENDANCE 行上的 status（PRESENT/NOSHOW，缺勤照扣、无豁免），不设独立出勤表。补课 = admin 发 RESCHEDULE 券（预约权/客服动作），**补课出勤照常扣课时——每一次实际授课都有成本，账上不出现免费课**。**v1 收款在线下：admin 手工写 caiwu(+N, PURCHASE)；v2 上 order 后接管交易事实（PAID 入账、REFUNDED 反冲），账本无需迁移**。幂等（unique(reason, user, ref)，同一事件最多记一笔）、可审计（能逐笔回答"课时怎么少的"）、可回滚（退款 = 反向条目）。

## 4. 关键规则（标注切片内/外；凡切片涉及的都在服务端强制）

| # | 规则 | 执行层 | 切片 |
|---|---|---|---|
| R1 | 时间冲突：券兑换或正式排班时，与学生现有 ACTIVE 课时间重叠 → 拒绝 | 服务端事务 | 内 |
| R2 | 教师冲突：同一教师不能出现在两个重叠时间的班 | 服务端（建班/调班） | 内 |
| R3 | 余额门槛：正式排班需余额 ≥ 4（一个月 buffer）；≤ 4 进入续费队列 | 服务端事务 | 内 |
| R4 | 扣课时幂等且不穿透：扣减 = caiwu 流水，unique(reason, user, ref) 使同一节课最多记一笔；余额不为负 | DB 部分唯一索引 + 事务 | 内 |
| R5 | 学生侧零写入口：不自主报课、不能取消/改期——一切经 admin 安排（可发 RESCHEDULE 券换课节）；缺席即 NOSHOW 照扣（R11），涉及出勤照常扣费。唯一不扣钱的场景是学校原因取消（老师请假 → lesson=CANCELLED），课时自然保留 | 服务端 | 内 |
| R6 | 权限两级：**senior** 读全员、写全员；**junior** 仅读写自己名下学生，班级只可见剩余位数量、不可见他人名单 | 服务端 + 行级过滤 | 内 |
| R7 | 容量：名额按节计——单节课占用 = student_time 名单 + order_lesson 占位行（试听/补课同池计数），不得超过 Class 容量；正式排班与券兑换同过此检查 | 服务端事务 | 内 |
| R8 | 试听券唯一：每学生同时最多一张未完结 TRIAL 券（不分科目，部分唯一索引兜底）；想试其他科目，听完当前券后由 admin 再发 | DB + 服务端 | 内 |
| R9 | 券有效期：默认 30 天过期；过期由 admin 手动重发并留痕 | 服务端 | 内 |
| R10 | 转化原子性：充值入账（v1 手工 caiwu；v2 起 order=PAID）与正式排班同事务完成；ref 唯一防重复入账，券状态守卫防重复转化 | 服务端事务 | 内 |
| R11 | 补课：**出勤照扣课时**——补课班老师的工资不会少发，每一次实际授课都有成本；NOSHOW 也照扣（那节课老师已教）。RESCHEDULE 券不是免扣凭证，是 admin 发的**补课预约权**（客服/营销动作，允许跨班预约一节）；是否另行赠送课时由 admin 用 GRANT 自主决定 | 服务端事务 | 内 |
| R12 | 教师可用窗（具体日期 + 时段，非周几循环）：R12a 同一天不互相重叠；R12b 建班/调班校验未来 4 节（与 R7 同展望期）的日期均有覆盖窗 | 服务端事务 | 内 |
| R13 | 预约物化：兑换/预约时目标 (class, date) 的 lesson 不存在 → 从 class 周循环现场创建，并写 order_lesson 关联 | 服务端事务 | 内 |
| R14 | 学生状态迁移只由服务端驱动：事件迁移（录入/试听出勤/转化/账本写入重算）+ 每日扫描（跟进队列生成、churning 判定）；无手工改状态入口 | 服务端 | 内 |
