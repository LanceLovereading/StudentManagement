"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";

export function CreateStudentForm() {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr("");
        try {
          await post("/api/students", { name: f.get("name"), phone: f.get("phone"), password: f.get("password") || undefined });
          (e.target as HTMLFormElement).reset();
          router.refresh();
        } catch (ex) {
          setErr((ex as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field"><label>姓名</label><input name="name" className="input" required /></div>
      <div className="field"><label>手机号（登录用）</label><input name="phone" className="input" required placeholder="04xx xxx xxx" /></div>
      <div className="field"><label>初始密码</label><input name="password" className="input" placeholder="默认 demo1234" /></div>
      <button className="btn btn-primary" disabled={busy}>录入学生</button>
      {err && <span className="err" style={{ margin: 0 }}>{err}</span>}
    </form>
  );
}

type ClassOption = { id: number; label: string };

export function IssueVoucherForm({ userId, subjects }: { userId: number; subjects: string[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr("");
        try {
          await post("/api/vouchers", { userId, subject: f.get("subject") });
          (e.target as HTMLFormElement).reset();
          router.refresh();
        } catch (ex) {
          setErr((ex as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label>试听科目</label>
        <select name="subject" className="select">
          {subjects.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <button className="btn btn-primary" disabled={busy}>发试听券（30 天）</button>
      {err && <span className="err" style={{ margin: 0 }}>{err}</span>}
    </form>
  );
}

export function RechargeForm({ userId }: { userId: number }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr("");
        setOk("");
        try {
          const j = await post("/api/recharge", { userId, hours: Number(f.get("hours")) });
          setOk(`已入账，余额 ${j.balanceAfter} 课时`);
          (e.target as HTMLFormElement).reset();
          router.refresh();
        } catch (ex) {
          setErr((ex as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field"><label>充值课时（收款在线下）</label><input name="hours" type="number" min={1} className="input" required /></div>
      <button className="btn btn-primary" disabled={busy}>登记充值</button>
      {err && <span className="err" style={{ margin: 0 }}>{err}</span>}
      {ok && <span className="badge ok">{ok}</span>}
    </form>
  );
}

export function EnrollForm({ userId, classes }: { userId: number; classes: ClassOption[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr("");
        try {
          await post("/api/enroll", { userId, classId: Number(f.get("classId")) });
          (e.target as HTMLFormElement).reset();
          router.refresh();
        } catch (ex) {
          setErr((ex as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label>加入班级</label>
        <select name="classId" className="select">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      <button className="btn" disabled={busy}>添加课（R1/R3/R7 服务端校验）</button>
      {err && <span className="err" style={{ margin: 0 }}>{err}</span>}
    </form>
  );
}

export function ConvertForm({ voucherId, classes }: { voucherId: number; classes: ClassOption[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr("");
        try {
          await post(`/api/vouchers/${voucherId}/convert`, { hours: Number(f.get("hours")), classId: Number(f.get("classId")) });
          router.refresh();
        } catch (ex) {
          setErr((ex as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field"><label>购买课时</label><input name="hours" type="number" min={1} className="input" required /></div>
      <div className="field">
        <label>正式排班进</label>
        <select name="classId" className="select">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      <button className="btn btn-primary" disabled={busy}>转化（充值 + 排班同事务）</button>
      {err && <span className="err" style={{ margin: 0 }}>{err}</span>}
    </form>
  );
}

export function ResultButtons({ voucherId }: { voucherId: number }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  async function mark(outcome: "ATTENDED" | "NOSHOW") {
    setErr("");
    try {
      await post(`/api/vouchers/${voucherId}/result`, { outcome });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <span>
      <button className="btn btn-sm" onClick={() => mark("ATTENDED")}>标记出勤</button>{" "}
      <button className="btn btn-sm btn-danger" onClick={() => mark("NOSHOW")}>标记缺勤</button>
      {err && <span className="muted" style={{ fontSize: 12 }}> {err}</span>}
    </span>
  );
}
