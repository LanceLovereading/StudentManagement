import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getAdminSession, studentScope } from "@/lib/session";
import { VoucherBadge, fmtDateTime } from "@/components/badges";

export default async function VouchersPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");
  const vouchers = await db.voucher.findMany({
    where: { user: studentScope(admin) },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { id: "desc" },
  });

  return (
    <>
      <h1>试听券 <span className="muted" style={{ fontSize: 14 }}>{vouchers.length} 张</span></h1>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>#</th><th>学生</th><th>科目</th><th>状态</th><th>发放</th><th>有效期至</th><th>跟进</th><th></th></tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id}>
                <td className="muted">{v.id}</td>
                <td><Link href={`/admin/students/${v.user.id}`}><strong>{v.user.name}</strong></Link></td>
                <td>{v.subject ?? v.kind}</td>
                <td><VoucherBadge status={v.status} /></td>
                <td className="muted">{fmtDateTime(v.createdAt)}</td>
                <td className="muted">{fmtDateTime(v.validUntil)}</td>
                <td>{v.followedUpAt ? <span className="badge ok">已跟进</span> : v.status === "ATTENDED" ? <span className="badge warn">待跟进</span> : ""}</td>
                <td>{v.status === "ISSUED" && <Link className="btn btn-sm" href={`/admin/vouchers/${v.id}/redeem`}>去兑换</Link>}</td>
              </tr>
            ))}
            {vouchers.length === 0 && <tr><td colSpan={8} className="muted">暂无券——在学生详情页发放。</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
