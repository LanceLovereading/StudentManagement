"use client";

// 统一的写操作出口：所有 mutation 走 API 路由，返回 { ok, code?, message? }
export async function post(url: string, body?: object) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({ ok: false, message: "网络错误" }));
  if (!j.ok) throw new Error(j.message ?? "操作失败");
  return j;
}
