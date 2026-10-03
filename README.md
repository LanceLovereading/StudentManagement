# Austin Edu · 学生管理系统（Part B 纵切片）

切片：「**一张试听券的一生**」——发券 → 兑换试听 → 标记结果 → 跟进提示（LLM 起草）→ 转化（充值+排班同事务）→ 课时将尽提示续费。对应 DESIGN.md 的两条支柱：完整性（队列）与稳定性（不变量）。

技术栈：Next.js（App Router）+ TypeScript · Prisma + SQLite · iron-session · zod。时区口径：全程 Melbourne 本地日期字符串，无时区换算。

## 快速开始

```bash
npm install
npm run db:push     # 建表（dev.db）
npm run db:seed     # 演示数据 + 部分唯一索引
npm run dev         # http://localhost:3000
```

演示账号：

| 角色 | 账号 | 密码 | 说明 |
|---|---|---|---|
| admin（senior） | `admin` | `admin123` | 读写全员；班级页可见名单 |
| admin（junior） | `amy` / `ben` | `amy123` / `ben123` | 仅自己名下学生；班级只见余位数 |
| 学生 | 手机号 `0401000001`… | `demo1234` | 只读「我的课表」 |

## 演示脚本（对应工作台三个数字）

1. `admin` 登录 → 工作台：**待跟进 / 待续费 / 待唤醒** 三队列（种子已铺好：张小弟、冯乐天待跟进且超 48h 标超时；周天乐、吴优、曹阳待续费；郑安琪、许诺待唤醒）。
2. 学生页录入新学生 → 发试听券 → 「去兑换」：逐班 **✓/✕ 预告**（王小宝的数学券：数学B 撞 Y11化学 → `R1_CONFLICT`；秦朗的英语券：英语B 满班 → `R7_FULL`）→ 兑换成功 → 标记出勤 → 工作台出现跟进项。
3. 「起草跟进」：LLM 生成话术（可编辑、复制）；**LLM 不可用时降级为空白框，流程照常**。转化：充值 + 排班同事务，学生变在读。
4. 待续费学生：登记充值 → 余额 > 4 自动复活为在读（每日扫描驱动）。
5. 学生手机号登录：只读「我的课表」——下节课、剩余课时、新安排。学生侧零写入口（R5）。

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
```

每个拒绝都带机器可读原因码；DB 唯一索引是最后一道兜底（P2002 → `DUPLICATE`）。

## LLM 跟进起草（唯一 LLM 落点）

`POST /api/draft`：结构化输出（`{message, suggestedClass, riskTag}`）经 zod 服务端校验。配置（可选，任何 OpenAI 兼容接口）：

```bash
LLM_BASE_URL=... LLM_API_KEY=... LLM_MODEL=...
```

未配置 / 超时 / 格式不符 → `{ok:true, degraded:true}`，前端降级为空白话术框——**券的状态机与跟进流程不依赖 LLM**。

## AI 使用说明（按作业要求披露）

- **AI 辅助**：脚手架与代码生成（Prisma 模型、Next.js 页面与 API、种子脚本）、规则引擎实现、curl 破坏测试脚本、文档整理；设计讨论中的方案对比与风险提示。
- **人的判断**：业务口径（缺勤照扣、补课是预约权不是免扣、试听占真席位、学生侧零写入口）、范围裁剪（教师模块/家长体系后置）、规则取舍与全部验收标准；DESIGN.md 中的业务理解为一方观点。
- 全部提交历史自 `git init` 起，无 squash。

## 已知取舍

- SQLite + `prisma db push`；R8/报名 ACTIVE 唯一两个**部分唯一索引**在 seed 里以裸 SQL 建立（Prisma 不直接支持）。换 Postgres/Turso 时改 `provider` + `DATABASE_URL` 后用 `prisma migrate dev` 重建即可，索引会进迁移文件。
- 每日扫描在工作台加载时幂等执行，未引入 cron 依赖；多实例部署时改为定时任务调用 `runDailyScan()`。
- 兑换页预告与接口裁决共用 `checkSingleRedeem`——一份校验逻辑，没有第二套标准。
- 出勤扣费（caiwu ATTENDANCE 写入）属点名模块（下阶段），账本结构已就位；种子里已有历史出勤流水供对账演示。
