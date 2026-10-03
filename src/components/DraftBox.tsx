"use client";

import { useState } from "react";
import { post } from "@/lib/client";

// LLM 跟进话术起草：成功展示可编辑话术；LLM 不可用时降级为空白框——跟进流程照常完成。
export default function DraftBox({ userId, kind, label }: { userId: number; kind: "trial" | "renewal"; label?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function draft() {
    setBusy(true);
    try {
      const j = await post("/api/draft", { userId, kind });
      setText(j.data?.message ?? "");
      setDegraded(Boolean(j.degraded));
    } catch {
      setText("");
      setDegraded(true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-sm" disabled={busy} onClick={() => { setOpen(true); void draft(); }}>
        {busy ? "起草中…" : (label ?? "起草跟进")}
      </button>
    );
  }
  return (
    <div className="main" style={{ minWidth: 280 }}>
      <textarea className="textarea" value={text ?? ""} onChange={(e) => setText(e.target.value)} placeholder="跟进话术…" />
      <div className="actions" style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
        <button className="btn btn-sm btn-primary" onClick={() => navigator.clipboard?.writeText(text ?? "")}>复制</button>
        <button className="btn btn-sm" onClick={() => setOpen(false)}>收起</button>
        {degraded && <span className="muted" style={{ fontSize: 12 }}>LLM 不可用，已降级为空白框——跟进流程照常</span>}
      </div>
    </div>
  );
}
