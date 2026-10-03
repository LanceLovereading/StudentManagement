"use client";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card">
      <h2>出错了</h2>
      <p className="err">{error.message || "页面加载失败"}</p>
      <button className="btn" onClick={reset}>重试</button>
    </div>
  );
}
