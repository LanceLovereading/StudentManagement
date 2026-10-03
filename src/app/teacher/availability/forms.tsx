"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function AddWindowForm({ today }: { today: string }) {
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
          await post("/api/teacher/availability", {
            date: String(f.get("date")),
            startMin: toMin(String(f.get("start"))),
            endMin: toMin(String(f.get("end"))),
          });
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
        <label>日期</label>
        <input name="date" type="date" className="input" required min={today} defaultValue={today} />
      </div>
      <div className="field"><label>开始</label><input name="start" type="time" className="input" required defaultValue="14:00" /></div>
      <div className="field"><label>结束</label><input name="end" type="time" className="input" required defaultValue="18:00" /></div>
      <button className="btn btn-primary" disabled={busy}>登记可用时段</button>
      {err && <span className="err" style={{ margin: 0 }}>{err}</span>}
    </form>
  );
}

export function DeleteWindowButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-sm btn-danger"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await post("/api/teacher/availability/delete", { id });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      删除
    </button>
  );
}
