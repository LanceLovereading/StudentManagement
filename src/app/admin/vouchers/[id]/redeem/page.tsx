import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getAdminSession, assertVoucherVisible } from "@/lib/session";
import { RuleError } from "@/lib/errors";
import { checkSingleRedeem, lessonOccupancy } from "@/lib/rules";
import { melbourneToday, nextOccurrence, weekdayName, fmtMin } from "@/lib/time";
import { fmtDateTime } from "@/components/badges";
import RedeemButton from "./redeem-button";

// 兑换页：界面预告结果（✓/✕ + 余位含试听席），服务端做最终裁决。
// 预告与裁决共用 checkSingleRedeem——预告即裁决逻辑，没有第二套标准。
export default async function RedeemPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");
  const { id } = await params;
  const voucher = await assertVoucherVisible(admin, Number(id));
  const today = melbourneToday();

  if (voucher.kind !== "TRIAL" && voucher.kind !== "RESCHEDULE") {
    return <Notice>仅试听券/补课券可兑换。<Link href="/admin/vouchers">返回</Link></Notice>;
  }
  if (voucher.status !== "ISSUED") {
    return <Notice>该券状态为「{voucher.status}」，无需兑换。<Link href="/admin/vouchers">返回</Link></Notice>;
  }
  if (voucher.validUntil.getTime() < Date.now()) {
    return <Notice>该券已于 {fmtDateTime(voucher.validUntil)} 过期（R9）——由 admin 重发并留痕。<Link href={`/admin/students/${voucher.userId}`}>返回学生页</Link></Notice>;
  }

  const candidates = await db.class.findMany({
    where: { status: "OPEN", ...(voucher.kind === "TRIAL" ? { subject: voucher.subject ?? "" } : {}) },
    include: { teacher: { select: { name: true } } },
    orderBy: { id: "asc" },
  });

  const rows = await Promise.all(candidates.map(async (cls) => {
    const date = nextOccurrence(cls.weekday, today);
    try {
      await checkSingleRedeem(db, voucher.userId, cls, date);
      const occ = await lessonOccupancy(db, cls.id, date);
      return { cls, date, ok: true as const, seats: cls.capacity - occ.total };
    } catch (e) {
      const code = e instanceof RuleError ? e.code : "INTERNAL";
      return { cls, date, ok: false as const, why: e instanceof RuleError ? e.message : "校验失败", code };
    }
  }));

  return (
    <>
      <h1>
        为 {voucher.user.name} 兑换 {voucher.kind === "TRIAL" ? `${voucher.subject} 试听` : "补课（跨班一节）"}{" "}
        <span className="muted" style={{ fontSize: 14 }}>有效期至 {fmtDateTime(voucher.validUntil)}</span>
      </h1>
      <div className="card">
        {rows.map(({ cls, date, ...r }) => (
          <div className={`verdict ${r.ok ? "ok" : "bad"}`} key={cls.id}>
            <span className="mark">{r.ok ? "✓" : "✕"}</span>
            <strong>{cls.name}</strong>
            <span className="cap">{weekdayName(cls.weekday)} {fmtMin(cls.startMin)} · {date} · {cls.teacher.name}</span>
            {r.ok ? (
              <>
                <span className="cap">余位 {r.seats}（含试听席）</span>
                <RedeemButton voucherId={voucher.id} classId={cls.id} studentId={voucher.userId} />
              </>
            ) : (
              <span className="why">{r.why}（{r.code}）</span>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="muted">暂无 {voucher.subject} 的开课班。</p>}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        预告只是预览：点击兑换后服务端在同一事务里重新校验（R1/R7）并物化课节（R13）。
      </p>
    </>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="card">
      <p>{children}</p>
    </div>
  );
}
