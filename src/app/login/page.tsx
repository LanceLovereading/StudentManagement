"use client";

import { useState } from "react";

const TABS = [
  ["admin", "教务"],
  ["teacher", "教师"],
  ["user", "学生"],
  ["parent", "家长"],
] as const;

const PLACEHOLDER: Record<string, string> = {
  admin: "admin / amy / ben",
  teacher: "0499000001",
  user: "0401000001",
  parent: "13900000001",
};

const HINTS: Record<string, string> = {
  admin: "演示账号：admin / admin123（junior：amy、ben，密码同后缀）",
  teacher: "演示账号：0499000001 王老师 / teach123（…02 李 · …03 陈 · …04 刘）",
  user: "演示账号：0401000001 张小弟 / demo1234（…02 起同理）",
  parent: "演示账号：13900000001 张爸爸 / parent123（…02 王芳带两孩）",
};

async function submit(role: string, account: string, password: string) {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, account, password }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.message ?? "登录失败");
  location.href = j.redirect;
}

export default function LoginPage() {
  const [tab, setTab] = useState<string>("admin");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr("");
    try {
      await submit(tab, String(f.get("account") ?? ""), String(f.get("password") ?? ""));
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <div className="login-card" style={{ width: 400 }}>
        <h1>Austin Edu · 学生管理</h1>
        <p className="muted">线索别漏掉，交付别出丑。</p>

        <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
          {TABS.map(([role, label]) => (
            <button key={role} type="button" className={`btn btn-sm ${tab === role ? "btn-primary" : ""}`} onClick={() => { setTab(role); setErr(""); }}>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="login-form">
          <div className="field">
            <label>{tab === "admin" ? "用户名" : "手机号"}</label>
            <input name="account" className="input" placeholder={PLACEHOLDER[tab]} autoComplete="username" />
          </div>
          <div className="field">
            <label>密码</label>
            <input name="password" type="password" className="input" autoComplete="current-password" />
          </div>
          <button className="btn btn-primary" disabled={busy} style={{ width: "100%" }}>登录</button>
          {err && <p className="err">{err}</p>}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>{HINTS[tab]}</p>
        </form>
      </div>
    </main>
  );
}
