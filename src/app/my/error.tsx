"use client";

export default function MyError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container">
      <div className="card">
        <h2>出错了</h2>
        <p className="err">课表加载失败，请稍后再试。</p>
        <button className="btn" onClick={reset}>重试</button>
      </div>
    </div>
  );
}
