"use client";

import { useState } from "react";

async function submit(role: "admin" | "user", account: string, password: string) {
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
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function onSubmit(role: "admin" | "user") {
    return async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      setBusy(true);
      setErr("");
      try {
        await submit(role, String(f.get("account") ?? ""), String(f.get("password") ?? ""));
      } catch (ex) {
        setErr((ex as Error).message);
      } finally {
        setBusy(false);
      }
    };
  }

  return (
    <main className="login-wrap">
      <div className="login-card">
        <h1>Austin Edu · 学生管理</h1>
        <p className="muted">线索别漏掉，交付别出丑。</p>

        <form onSubmit={onSubmit("admin")} className="login-form">
          <h2>教务登录</h2>
          <div className="field">
            <label>用户名</label>
            <input name="account" className="input" placeholder="admin / amy / ben" autoComplete="username" />
          </div>
          <div className="field">
            <label>密码</label>
            <input name="password" type="password" className="input" autoComplete="current-password" />
          </div>
          <button className="btn btn-primary" disabled={busy}>教务进入工作台</button>
        </form>

        <form onSubmit={onSubmit("user")} className="login-form">
          <h2>学生 / 家长登录</h2>
          <div className="field">
            <label>手机号</label>
            <input name="account" className="input" placeholder="0401000001" autoComplete="username" />
          </div>
          <div className="field">
            <label>密码</label>
            <input name="password" type="password" className="input" autoComplete="current-password" />
          </div>
          <button className="btn" disabled={busy}>查看我的课表</button>
        </form>

        {err && <p className="err">{err}</p>}
      </div>
    </main>
  );
}
