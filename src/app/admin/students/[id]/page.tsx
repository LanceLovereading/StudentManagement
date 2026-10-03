import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { StatusBadge, VoucherBadge, fmtDateTime } from "@/components/badges";
import FollowedButton from "@/components/FollowedButton";
import { weekdayName, fmtMin } from "@/lib/time";
import {
  IssueVoucherForm, EnrollForm, ConvertForm, ResultButtons,
  MakeupVoucherForm, GrantForm, OrderForm, OrderActions, LinkParentForm,
} from "@/components/student-forms";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id: Number(id) },
    include: {
      ownerAdmin: { select: { name: true } },
      studentTimes: { include: { class: { include: { teacher: { select: { name: true } } } } }, orderBy: { id: "asc" } },
      vouchers: { orderBy: { id: "desc" } },
      caiwu: { orderBy: { id: "desc" } },
      orderLessons: { include: { lesson: { include: { class: { select: { name: true } } } } }, orderBy: { id: "desc" } },
      orders: { orderBy: { id: "desc" } },
      studentParents: { include: { parent: { select: { id: true, name: true, phone: true } } } },
    },
  });
  // R6：junior 越权即不可见
  if (!user || (admin.level !== "SENIOR" && user.ownerAdminId !== admin.id)) notFound();

  const balance = user.caiwu[0]?.balanceAfter ?? 0;
  const subjects = [...new Set((await db.class.findMany({ select: { subject: true } })).map((c) => c.subject))];
  const classes = await db.class.findMany({ where: { status: "OPEN" }, orderBy: { id: "asc" } });
  const classOptions = classes.map((c) => ({ id: c.id, label: `${c.name}（${weekdayName(c.weekday)} ${fmtMin(c.startMin)} · ${c.subject}）` }));
  const attendedVoucher = user.vouchers.find((v) => v.kind === "TRIAL" && v.status === "ATTENDED");
  const classLabel = (c: { weekday: number; startMin: number; endMin: number }) => `${weekdayName(c.weekday)} ${fmtMin(c.startMin)}-${fmtMin(c.endMin)}`;

  return (
    <>
      <h1>
        {user.name} <StatusBadge status={user.status} />{" "}
        <span className="muted" style={{ fontSize: 14 }}>{user.phone} · 归属 {user.ownerAdmin.name} · 余额 {balance} 课时</span>
      </h1>

      {attendedVoucher && user.status === "tried" && (
        <section className="card" id="convert">
          <h2>转化 <span className="muted">充值入账 + 正式排班同事务（R10）</span></h2>
          <ConvertForm voucherId={attendedVoucher.id} classes={classOptions} />
        </section>
      )}

      <section className="card" id="orders">
        <h2>订单收款 <span className="muted">收款线下；PAID 同事务入账，ref=order，一张订单只入账一次</span></h2>
        <OrderForm userId={user.id} />
        {user.orders.length > 0 && (
          <table className="table" style={{ marginTop: 12 }}>
            <thead><tr><th>#</th><th>课时</th><th>金额</th><th>状态</th><th>创建</th><th>入账</th><th></th></tr></thead>
            <tbody>
              {user.orders.map((o) => (
                <tr key={o.id}>
                  <td className="muted">{o.id}</td>
                  <td>{o.hours} 课时</td>
                  <td>¥{(o.amountCents / 100).toFixed(2)}</td>
                  <td><span className={`badge ${o.status === "PAID" ? "ok" : o.status === "REFUNDED" ? "bad" : "gray"}`}>{o.status}</span></td>
                  <td className="muted">{fmtDateTime(o.createdAt)}</td>
                  <td className="muted">{o.paidAt ? fmtDateTime(o.paidAt) : "—"}</td>
                  <td><OrderActions orderId={o.id} status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>赠送课时 <span className="muted">admin 自主动作（GRANT），与充值同源入账</span></h2>
        <GrantForm userId={user.id} />
      </section>

      <section className="card">
        <h2>在读班级</h2>
        {user.studentTimes.length === 0 && <p className="muted">尚未排班。</p>}
        {user.studentTimes.length > 0 && (
          <table className="table">
            <thead><tr><th>班级</th><th>时间</th><th>老师</th><th>报名于</th><th>状态</th></tr></thead>
            <tbody>
              {user.studentTimes.map((st) => (
                <tr key={st.id}>
                  <td>{st.class.name} <span className="muted">({st.class.subject})</span></td>
                  <td>{classLabel(st.class)}</td>
                  <td className="muted">{st.class.teacher.name}</td>
                  <td className="muted">{fmtDateTime(st.startedAt)}</td>
                  <td><span className={`badge ${st.status === "ACTIVE" ? "ok" : "gray"}`}>{st.status === "ACTIVE" ? "在读" : "已退"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3>添加课</h3>
        <EnrollForm userId={user.id} classes={classOptions} />
      </section>

      <section className="card">
        <h2>试听券 / 补课券 <span className="muted">每学生同时仅一张未完结试听券（R8）</span></h2>
        {user.vouchers.length === 0 && <p className="muted">还没有券。</p>}
        {user.vouchers.length > 0 && (
          <table className="table">
            <thead><tr><th>#</th><th>类型</th><th>科目</th><th>状态</th><th>有效期至</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>
              {user.vouchers.map((v) => (
                <tr key={v.id}>
                  <td className="muted">{v.id}</td>
                  <td><span className={`badge ${v.kind === "TRIAL" ? "" : "warn"}`}>{v.kind === "TRIAL" ? "试听" : "补课"}</span></td>
                  <td>{v.subject ?? "—"}</td>
                  <td><VoucherBadge status={v.status} /></td>
                  <td className="muted">{fmtDateTime(v.validUntil)}</td>
                  <td className="muted">{v.outcomeNote ?? ""}</td>
                  <td>
                    {v.status === "ISSUED" && <Link className="btn btn-sm btn-primary" href={`/admin/vouchers/${v.id}/redeem`}>去兑换</Link>}
                    {v.kind === "TRIAL" && v.status === "REDEEMED" && <ResultButtons voucherId={v.id} />}
                    {v.kind === "TRIAL" && v.status === "ATTENDED" && !v.followedUpAt && <FollowedButton voucherId={v.id} />}
                    {v.followedUpAt && <span className="badge ok">已跟进 {fmtDateTime(v.followedUpAt)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3>发新券</h3>
        <IssueVoucherForm userId={user.id} subjects={subjects} />
        <div style={{ marginTop: 10 }}>
          <MakeupVoucherForm userId={user.id} />
        </div>
      </section>

      {user.orderLessons.length > 0 && (
        <section className="card">
          <h2>单节占位 <span className="muted">试听/补课的按节预约（order_lesson）</span></h2>
          <table className="table">
            <thead><tr><th>班级</th><th>日期</th><th>课节状态</th></tr></thead>
            <tbody>
              {user.orderLessons.map((ol) => (
                <tr key={ol.id}>
                  <td>{ol.lesson.class.name}</td>
                  <td>{ol.lesson.date}</td>
                  <td><span className={`badge ${ol.lesson.status === "CANCELLED" ? "bad" : "gray"}`}>{ol.lesson.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h2>家长 <span className="muted">付款与沟通对象；家长可登录看只读课表</span></h2>
        {user.studentParents.length === 0 && <p className="muted">尚未关联家长。</p>}
        {user.studentParents.length > 0 && (
          <table className="table">
            <tbody>
              {user.studentParents.map((sp) => (
                <tr key={sp.id}>
                  <td><strong>{sp.parent.name}</strong></td>
                  <td className="muted">{sp.parent.phone}</td>
                  <td><span className="badge">{sp.relation}</span>{sp.isPrimary && <span className="badge ok">主联系人</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3>关联家长</h3>
        <LinkParentForm studentId={user.id} />
      </section>

      <section className="card">
        <h2>课时账本 <span className="muted">每笔变动可逐笔回答"课时怎么少的"</span></h2>
        {user.caiwu.length === 0 && <p className="muted">暂无流水。</p>}
        {user.caiwu.length > 0 && (
          <table className="table">
            <thead><tr><th>时间</th><th>事由</th><th>出勤</th><th>变动</th><th>余额快照</th><th className="muted">ref</th></tr></thead>
            <tbody>
              {user.caiwu.map((c) => (
                <tr key={c.id}>
                  <td className="muted">{fmtDateTime(c.createdAt)}</td>
                  <td>{c.reason}</td>
                  <td>{c.status ? <span className={`badge ${c.status === "PRESENT" ? "ok" : "bad"}`}>{c.status}</span> : ""}</td>
                  <td style={{ color: c.delta > 0 ? "var(--ok)" : "var(--bad)" }}>{c.delta > 0 ? `+${c.delta}` : c.delta}</td>
                  <td><strong>{c.balanceAfter}</strong></td>
                  <td className="muted" style={{ fontSize: 12 }}>{c.ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
