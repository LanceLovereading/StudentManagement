# Austin Edu · 学生管理系统（Part B 纵切片）

切片：「**一张试听券的一生**」——发券 → 兑换试听 → 标记结果 → 跟进提示（LLM 起草）→ 转化（充值+排班同事务）→ 课时将尽提示续费。对应 DESIGN.md 的两条支柱：完整性（队列）与稳定性（不变量）。

切片验收后并入的后续模块（"架构立住之后，剩下都是加模块"的现场验证）：**点名/反馈操作台（教师端）**、**教师登录与可用时间**、**补课券跨班兑换**、**赠送课时**、**订单收款/退款**、**家长只读门户**——未新立任何平行账本，全部长在 caiwu / voucher / order_lesson 之上。

技术栈：Next.js（App Router）+ TypeScript · Prisma + PostgreSQL（Neon 就绪，本地任意 Postgres）· iron-session · zod。时区口径：全程 Melbourne 本地日期字符串，无时区换算。

## 快速开始

```bash
npm install
cp .env.example .env        # DATABASE_URL 指向本地/远程 Postgres
npm run db:push             # 建表
npm run db:seed             # 演示数据 + 部分唯一索引
npm run dev                 # http://localhost:3000
```

演示账号：

| 角色 | 账号 | 密码 | 说明 |
|---|---|---|---|
| admin（senior） | `admin` | `admin123` | 读写全员；排班表页可见名单 |
| admin（junior） | `amy` / `ben` | `amy123` / `ben123` | 仅自己名下学生：排课/收款/转化/兑换均可；建班、调班、停开与名单仅 senior |
| 教师 | 手机号 `0499000001`…（王/李/陈/刘老师） | `teach123` | 我的课表、可上课时间、点名/反馈 |
| 学生 | 手机号 `0401000001`… | `demo1234` | 只读「我的课表」 |
| 家长 | 手机号 `13900000001`…（张爸爸/王芳/李妈妈） | `parent123` | 只读孩子余额与课表（王芳带两个孩子） |

## 演示脚本（对应工作台三个数字）

1. `admin` 登录 → 工作台：**待跟进 / 待续费 / 待唤醒** 三队列（种子已铺好：张小弟、冯乐天待跟进且超 48h 标超时；李小妹已跟进——弱化保留在队列，不消失；周天乐、吴优、曹阳待续费；郑安琪、许诺待唤醒）。
2. 工作台花名册（折叠区，可搜索）录入新学生 → 发试听券 → 「去兑换」：逐班 **✓/✕ 预告**（王小宝的 Maths 券：Year 8 Maths 撞他在读的 Selective Entry Program → `R1_CONFLICT`；秦朗的 English 券：Year 6 English & Writing 满班 → `R7_FULL`）→ 兑换成功 → 标记出勤 → 工作台出现跟进项。
3. 「起草跟进」：LLM 生成话术（可编辑、复制）；**LLM 不可用时降级为空白框，流程照常**。「标记已跟进」后条目不消失——近 7 天弱化保留（绿色徽章带时间），只剩「转化」按钮。转化：充值 + 排班同事务，学生变在读。
4. 待续费学生：登记充值 → 余额 > 4 自动复活为在读（每日扫描驱动）。
5. 教师登录（如刘老师 `0499000004`）：可上课时间按**具体日期**登记（同日重叠被拒）→ 点名/反馈操作台：在读与补课学生**出勤照扣**（郑安琪余额 0 会被单独指出——R4 不穿透且不影响他人），补课学生出勤后 RESCHEDULE 券变 USED，试听学生免费走券状态机。
6. admin：学生详情页创建订单 → 「标记已收款」同事务入账（ref=order，重放被守卫拒绝）→ 退款走反向条目，不删历史；赠送课时（GRANT）同源入账。
7. 家长登录（王芳 `13900000002`）：只读看两个孩子的余额与课表。学生侧零写入口（R5）。

## 规则 → 代码映射

| 规则 | 位置 |
|---|---|
| R1 时间冲突 | `src/lib/rules.ts` `findSingleLessonConflict` / `checkEnroll`（int 重叠比较） |
| R3 余额门槛 ≥4 | `checkEnroll`；阈值 `src/lib/ledger.ts` `ENDING_THRESHOLD` |
| R4 幂等不穿透 | `ledger.ts` `writeCaiwu` + DB `unique(reason,userId,ref)` |
| R5 学生零写入口 | 学生角色无任何写 API；`/my` 全查询 |
| R6 两级权限 | `session.ts` `studentScope` / `assertStudentVisible` / `assertVoucherVisible`；junior 的名单字段不进查询 |
| R7 容量按节计 | `lessonOccupancy`：student_time 名单 + order_lesson 占位行，试听/补课同池 |
| R8 试听券唯一 | `api/vouchers` 预检 + 部分唯一索引（seed 内 `one_open_trial_per_user`） |
| R9 有效期 | 兑换路由拒绝 + 每日扫描把过期 ISSUED 券转 EXPIRED |
| R10 转化原子性 | `api/vouchers/[id]/convert` 单事务：入账→校验→排班→券 CONVERTED→学生 subscribed；重复提交被券状态守卫拦下 |
| R13 预约物化 | 兑换事务内 lesson upsert |
| R11 补课照扣 | 兑换页接受 RESCHEDULE（跨科目）；点名分发 `lib/rollcall.ts`：出勤/缺勤都扣，券 → USED |
| R12 教师可用窗 | `/api/teacher/availability`（R12a 同师不重叠）；班级须落在窗内（R12b）在建班侧强制，本切片无建班入口 |
| R4 点名幂等 | `lib/rollcall.ts` + caiwu unique(reason,user,ref)；逐生独立，R4_OVERDRAFT 不影响他人 |
| R2 教师不撞班 | `lib/rules.ts` `checkTeacherConflict`（建班/调班，编辑排除自身） |
| R12b 班时在窗内 | `checkWithinAvailability`：可用窗是**具体日期 + 时段**（非周几循环）；建班/调班校验学期内未来 4 节（与 R7 同展望期）逐日有覆盖窗，缺哪天报哪天 |
| 学期边界 | `upcomingOccurrences`：班是周循环、学期是有界区间——R7 容量展望 / R12b 可用窗展望 / 学生课表 / lesson 物化全部截在 `[startDate, endDate]` 内；学期已尽 → `CLASS_ENDED`（等新学期开班） |
| 模板开班 | `ClassTemplate` 只存课程骨架；`POST /api/classes` 带 `templateId` + 学期日期 = 新学期开班；详情页「存为模板」沉淀骨架 |
| 调班影响面 | `checkClassEdit`：改时间自动校验在读学生不撞班（R1）；容量不得低于在读人数与未来课节占用 |
| R14 状态机只由服务端驱动 | `ledger.ts` `recomputeLifecycle` + `scan.ts` `runDailyScan`（工作台加载时幂等执行；生产换 cron 调同一函数） |

## 破坏测试（绕过界面直接打 API，实际输出）

```bash
# 登录后（-b admin.jar）：
curl -X POST :3000/api/vouchers            -d '{"userId":<已有未完结券的学生>,"subject":"数学"}'
# → 422 {"code":"R8_DUP_TRIAL"}
curl -X POST :3000/api/vouchers/<id>/redeem -d '{"classId":<时间重叠的班>}'   # → 422 R1_CONFLICT
curl -X POST :3000/api/vouchers/<id>/redeem -d '{"classId":<满班>}'           # → 422 R7_FULL
curl -X POST :3000/api/vouchers/<id>/redeem -d '{"classId":1}'                # 过期券 → 422（R9_EXPIRED / 已扫描为 VOUCHER_STATE）
curl -X POST :3000/api/vouchers/<id>/convert -d '{"hours":1,"classId":<id>}'  # 余额不足 → 422 R3_LOW_BALANCE
# 同一转化请求重放 → 422 R10_GUARD（券已 CONVERTED，状态守卫幂等）
# junior 会话写 senior 学生 → 403 FORBIDDEN
curl -X POST :3000/api/teacher/availability -d '{"date":"2026-10-07","startMin":900,"endMin":1020}' # 同日重叠 → 422 R12_OVERLAP；过去日期 → BAD_REQUEST
# 同一订单重复「标记已收款」 → 422 ORDER_STATE（重放被守卫拒绝）
# 余额为 0 的学生点名未到 → 该生 R4_OVERDRAFT，其余学生正常入账
curl -X POST :3000/api/classes -d '{"name":"VCE Specialist Maths U3&4",...,"weekday":3,"startMin":1020,"endMin":1110,"startDate":"...","endDate":"..."}'  # 与 Methods U1&2 同师同时 → 422 R2_TEACHER_CONFLICT
curl -X POST :3000/api/classes -d '{"name":"Y10 数学E",...,"weekday":1,"startMin":600,"endMin":660,"startDate":"...","endDate":"..."}' # 教师周一无可用窗 → 422 R12_OUTSIDE_WINDOW（报缺窗日期）
curl -X POST :3000/api/classes -d '{"templateId":<id>,"startDate":"...","endDate":"..."}'  # 从模板开班；缺日期 → BAD_REQUEST，结束在过去 → BAD_TIME
# 调班把 VCE Chemistry 挪到周五 UCAT 时段 → 422 R1_CONFLICT（林晨撞自己的 UCAT）；容量低于在读 → 422 R7_CAPACITY
# 学期结束日改到过去后，排课/兑换该班 → 422 CLASS_ENDED（等新学期从模板开班）
# 停开班后排班/兑换 → 422 CLASS_CLOSED
```

每个拒绝都带机器可读原因码；DB 唯一索引是最后一道兜底（P2002 → `DUPLICATE`）。

## LLM 跟进起草（唯一 LLM 落点）

`POST /api/draft`：结构化输出（`{message, suggestedClass, riskTag}`）经 zod 服务端校验。配置（可选，任何 OpenAI 兼容接口）：

```bash
LLM_BASE_URL=... LLM_API_KEY=... LLM_MODEL=...
```

未配置 / 超时 / 格式不符 → `{ok:true, degraded:true}`，前端降级为空白话术框——**券的状态机与跟进流程不依赖 LLM**。

## 部署（Vercel + Neon）

线上形态 = Vercel（应用）+ Neon（Postgres）。provider 在开发期就从 SQLite 切到了 Postgres，业务代码与种子零改动。

**0. 前提**：Neon 与 Vercel 各一个账号（均可用 GitHub 登录）。Neon 建库时区域选 `ap-southeast-2`（悉尼，离墨尔本用户最近）。

**1. 建库 + 种子（本机跑，用 Neon 的 direct 连接串——主机不带 `-pooler`）**

```bash
DATABASE_URL="postgresql://<user>:<pw>@ep-xxx.ap-southeast-2.aws.neon.tech/neondb?sslmode=require" npm run db:push
DATABASE_URL="postgresql://<同上>" npm run db:seed
```

⚠️ `db:seed` 会**清空重建全部数据**——线上库只跑这一次（演示数据就位后不要再跑）。

**2. 部署到 Vercel**

```bash
npm i -g vercel
vercel                      # 首次引导登录 + 导入项目，构建选项全部默认
vercel env add DATABASE_URL production   # 粘 pooled 串（主机带 -pooler）+ &pgbouncer=true
vercel env add SESSION_SECRET production # openssl rand -base64 32
vercel --prod
```

**3. 回填 APP_URL 并重发**（重要，只差这一步会话就完整了）

```bash
vercel env add APP_URL production        # https://<你的应用>.vercel.app
vercel --prod
```

会话 cookie 的 Secure 标志由 `APP_URL`/`VERCEL` 推导（见 `session-options.ts` 注释——Safari 拒绝在明文 HTTP 上保存 Secure cookie，这是当初本地调试踩过的坑）；部署天然 HTTPS，回填后即生效。

**4. 可选**：`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`（任何 OpenAI 兼容接口；不配置时跟进话术起草降级为空白框，流程照常走通）。

环境变量全集见 `.env.example`。演示账号与本地一致（种子已建）。

## AI 使用说明（按作业要求披露）

- **AI 辅助**：脚手架与代码生成（Prisma 模型、Next.js 页面与 API、种子脚本）、规则引擎实现、curl 破坏测试脚本、文档整理；设计讨论中的方案对比与风险提示。
- **人的判断**：业务口径（缺勤照扣、补课是预约权不是免扣、试听占真席位、学生侧零写入口）、范围裁剪（教师模块/家长体系后置）、规则取舍与全部验收标准；DESIGN.md 中的业务理解为一方观点。
- 全部提交历史自 `git init` 起，无 squash。

## 已知取舍

- PostgreSQL + `prisma db push`；R8/报名 ACTIVE 唯一两个**部分唯一索引**在 seed 里以裸 SQL 建立（Prisma 不直接支持，Postgres 原生支持部分唯一索引）。历史上本地曾用 SQLite 开发，切 provider 后种子与业务代码零改动——字段全部是 Int/String/DateTime，时区决策在应用层不在库层。
- 订单（order 表，原 v2 设计）已提前启用：线下收款标记 PAID；接支付网关时挂回调即可，账本无需迁移。家长门户先于家长 CRM：只读，无站内信/通知。
- 账本归属：caiwu.byAdminId / byTeacherId 恰好其一（admin 记账 vs 教师点名扣减），由调用方保证。
- 会话 cookie 的 Secure 标志由部署地址推导（APP_URL / Vercel），不跟 NODE_ENV 走——踩过的坑：生产模式下 cookie 带 Secure、本地是明文 HTTP，Safari 严格拒收导致"登录成功却永远弹回登录页"，而 Chrome/Firefox 把 localhost 当可信上下文，把这个差异藏住了。
- 每日扫描在工作台加载时幂等执行，未引入 cron 依赖；多实例部署时改为定时任务调用 `runDailyScan()`。
- 兑换页预告与接口裁决共用 `checkSingleRedeem`——一份校验逻辑，没有第二套标准。
- 出勤扣费（caiwu ATTENDANCE 写入）属点名模块（下阶段），账本结构已就位；种子里已有历史出勤流水供对账演示。
