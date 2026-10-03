import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getAdminSession, studentScope } from "@/lib/session";
import { runDailyScan, getFollowupQueue, getRenewalQueue, getWakeupQueue } from "@/lib/scan";
import { StatusBadge, fmtDateTime } from "@/components/badges";
import DraftBox from "@/components/DraftBox";
import FollowedButton from "@/components/FollowedButton";
import StudentRoster from "@/components/student-roster";
import { CreateStudentForm } from "@/components/student-forms";

// 第一屏 = 今天的欠账。队列由每日扫描 + 查询生成，不是手工维护的 todo 表。
// 花名册折叠在队列之下（搜索进学生详情）——工作台是唯一的学生入口，不再单设学生列表页。
export default async function Workbench() {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");
  await runDailyScan();
  const scope = studentScope(admin);
  const [followups, renewals, wakeups, rosterUsers] = await Promise.all([
    getFollowupQueue(scope),
    getRenewalQueue(scope),
    getWakeupQueue(scope),
    db.user.findMany({
      where: scope,
      include: {
        caiwu: { orderBy: { id: "desc" }, take: 1 },
        ownerAdmin: { select: { name: true } },
        _count: { select: { studentTimes: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { id: "asc" },
    }),
  ]);
  const showOwner = admin.level === "SENIOR";
  const pending = followups.filter((f) => !f.followedAt).length;
  const roster = rosterUsers.map((u) => ({
    id: u.id, name: u.name, phone: u.phone, status: u.status,
    balance: u.caiwu[0]?.balanceAfter ?? 0, classes: u._count.studentTimes,
    ...(showOwner ? { owner: u.ownerAdmin.name } : {}),
  }));

  return (
    <>
      <h1>工作台 <span className="muted" style={{ fontSize: 14 }}>今天的欠账</span></h1>
      <div className="stats">
        <div className={`stat ${pending > 0 ? "hot" : ""}`}>
          <div className="num">{pending}</div>
          <div className="label">待跟进（试听后未转化）</div>
        </div>
        <div className={`stat ${renewals.length > 0 ? "warm" : ""}`}>
          <div className="num">{renewals.length}</div>
          <div className="label">待续费（课时将尽）</div>
        </div>
        <div className="stat">
          <div className="num">{wakeups.length}</div>
          <div className="label">待唤醒（已流失）</div>
        </div>
      </div>

      <section className="card">
        <h2>跟进队列 <span className="muted">试听结束即入队，超 48h 标超时；已跟进的近 7 天弱化保留</span></h2>
        {followups.length === 0 && <p className="muted">暂无待跟进的学生。</p>}
        {followups.map(({ user, voucher, overdue, waitHours, followedAt }) => (
          <div className={`queue-item ${followedAt ? "done" : ""}`} key={user.id}>
            <div className="main">
              <Link href={`/admin/students/${user.id}`}><strong>{user.name}</strong></Link>{" "}
              <span className="badge">{voucher?.subject}</span>{" "}
              {followedAt && <span className="badge ok">已跟进 {fmtDateTime(followedAt)}</span>}{" "}
              <span className="sub">
                {waitHours < 24 ? `${waitHours} 小时前试听` : `${Math.floor(waitHours / 24)} 天前试听`}
                {overdue ? " · 已超 48h" : ""} · {user.phone}
                {showOwner ? ` · ${user.ownerAdmin.name}` : ""}
              </span>
            </div>
            <div className="actions">
              {followedAt ? (
                <Link className="btn btn-sm btn-primary" href={`/admin/students/${user.id}#convert`}>转化</Link>
              ) : (
                <>
                  {overdue && <span className="badge warn">超时</span>}
                  <DraftBox userId={user.id} kind="trial" />
                  <FollowedButton voucherId={voucher!.id} />
                  <Link className="btn btn-sm btn-primary" href={`/admin/students/${user.id}#convert`}>转化</Link>
                </>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>续费队列 <span className="muted">余额 ≤ 4，先见底先谈</span></h2>
        {renewals.length === 0 && <p className="muted">暂无待续费的学生。</p>}
        {renewals.map((u) => (
          <div className="queue-item" key={u.id}>
            <div className="main">
              <Link href={`/admin/students/${u.id}`}><strong>{u.name}</strong></Link>{" "}
              <span className="badge warn">余 {u.caiwu[0]?.balanceAfter ?? 0} 课时</span>{" "}
              <span className="sub">{u.phone}{showOwner ? ` · ${u.ownerAdmin.name}` : ""}</span>
            </div>
            <div className="actions">
              <DraftBox userId={u.id} kind="renewal" label="起草续费" />
              <Link className="btn btn-sm" href={`/admin/students/${u.id}#orders`}>去收款</Link>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>唤醒队列 <span className="muted">余额为 0 超 14 天，需要其他营销动作</span></h2>
        {wakeups.length === 0 && <p className="muted">暂无待唤醒的学生。</p>}
        {wakeups.map((u) => (
          <div className="queue-item" key={u.id}>
            <div className="main">
              <Link href={`/admin/students/${u.id}`}><strong>{u.name}</strong></Link>{" "}
              <StatusBadge status={u.status} />{" "}
              <span className="sub">{u.phone}{showOwner ? ` · ${u.ownerAdmin.name}` : ""}</span>
            </div>
            <div className="actions">
              <Link className="btn btn-sm" href={`/admin/students/${u.id}#orders`}>去收款</Link>
            </div>
          </div>
        ))}
      </section>

      <section className="card" id="roster">
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            花名册与录入（{roster.length} 人）{" "}
            <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>搜索姓名/手机号 → 进学生详情：发券、排课、收款都在那里</span>
          </summary>
          <div style={{ marginTop: 12 }}>
            <CreateStudentForm />
            <div style={{ marginTop: 14 }}>
              <StudentRoster rows={roster} showOwner={showOwner} />
            </div>
          </div>
        </details>
      </section>
    </>
  );
}
