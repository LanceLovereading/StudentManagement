import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getAdminSession, studentScope } from "@/lib/session";
import { StatusBadge } from "@/components/badges";
import { CreateStudentForm } from "@/components/student-forms";

export default async function StudentsPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");
  const users = await db.user.findMany({
    where: studentScope(admin),
    include: {
      caiwu: { orderBy: { id: "desc" }, take: 1 },
      ownerAdmin: { select: { name: true } },
      _count: { select: { studentTimes: { where: { status: "ACTIVE" } } } },
    },
    orderBy: { id: "asc" },
  });

  return (
    <>
      <h1>学生 <span className="muted" style={{ fontSize: 14 }}>{users.length} 人</span></h1>
      <div className="card">
        <CreateStudentForm />
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>姓名</th><th>手机号</th><th>状态</th><th>余额</th><th>在读班</th>
              {admin.level === "SENIOR" && <th>归属教务</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/admin/students/${u.id}`}><strong>{u.name}</strong></Link></td>
                <td className="muted">{u.phone}</td>
                <td><StatusBadge status={u.status} /></td>
                <td>{u.caiwu[0]?.balanceAfter ?? 0} 课时</td>
                <td>{u._count.studentTimes}</td>
                {admin.level === "SENIOR" && <td className="muted">{u.ownerAdmin.name}</td>}
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={6} className="muted">暂无学生——先在上方录入。</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
