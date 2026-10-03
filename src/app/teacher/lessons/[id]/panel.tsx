"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";

export type PanelOccupant = {
  studentId: number;
  name: string;
  type: "在读" | "试听" | "补课";
  marked: string | null; // PRESENT / NOSHOW / ATTENDED / 已作废 / null=未点名
  feedback: string;
};

export default function RollCallPanel({ lessonId, occupants }: { lessonId: number; occupants: PanelOccupant[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ studentId: number; ok: boolean; message?: string }[] | null>(null);

  const pending = occupants.filter((o) => !o.marked);
  const [values, setValues] = useState<Record<number, { present: boolean; feedback: string }>>(
    Object.fromEntries(pending.map((o) => [o.studentId, { present: true, feedback: o.feedback }]))
  );

  async function submit() {
    setBusy(true);
    setResults(null);
    try {
      const j = await post(`/api/lessons/${lessonId}/rollcall`, {
        entries: pending.map((o) => ({
          studentId: o.studentId,
          present: values[o.studentId]?.present ?? true,
          feedback: values[o.studentId]?.feedback,
        })),
      });
      setResults(j.results);
      router.refresh();
    } catch (e) {
      setResults([{ studentId: 0, ok: false, message: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  const errMap = new Map((results ?? []).filter((r) => !r.ok).map((r) => [r.studentId, r.message ?? "失败"]));

  return (
    <div>
      <table className="table">
        <thead><tr><th>学生</th><th>类型</th><th>出勤</th><th>课堂反馈</th></tr></thead>
        <tbody>
          {occupants.map((o) => (
            <tr key={o.studentId}>
              <td><strong>{o.name}</strong>{errMap.get(o.studentId) && <div><span className="muted" style={{ fontSize: 12 }}>⚠ {errMap.get(o.studentId)}</span></div>}</td>
              <td><span className={`badge ${o.type === "在读" ? "ok" : o.type === "试听" ? "" : "warn"}`}>{o.type}</span></td>
              <td>
                {o.marked ? (
                  <span className={`badge ${o.marked === "PRESENT" || o.marked === "ATTENDED" ? "ok" : "bad"}`}>
                    {o.marked === "PRESENT" ? "已扣课时（出勤）" : o.marked === "NOSHOW" && o.type === "试听" ? "缺席·试听券作废" : o.marked === "NOSHOW" ? "已扣课时（缺勤）" : o.marked === "ATTENDED" ? "试听完成" : o.marked}
                  </span>
                ) : (
                  <span>
                    <label style={{ marginRight: 10 }}>
                      <input
                        type="radio"
                        name={`att-${o.studentId}`}
                        checked={values[o.studentId]?.present ?? true}
                        onChange={() => setValues((v) => ({ ...v, [o.studentId]: { ...v[o.studentId], present: true } }))}
                      />{" "}
                      到场
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`att-${o.studentId}`}
                        checked={!(values[o.studentId]?.present ?? true)}
                        onChange={() => setValues((v) => ({ ...v, [o.studentId]: { ...v[o.studentId], present: false } }))}
                      />{" "}
                      未到
                    </label>
                  </span>
                )}
              </td>
              <td>
                {o.marked ? (
                  <span className="muted">{o.feedback || "—"}</span>
                ) : (
                  <input
                    className="input"
                    style={{ minWidth: 220 }}
                    value={values[o.studentId]?.feedback ?? ""}
                    placeholder="课堂反馈（可选）"
                    onChange={(e) => setValues((v) => ({ ...v, [o.studentId]: { ...v[o.studentId], feedback: e.target.value } }))}
                  />
                )}
              </td>
            </tr>
          ))}
          {occupants.length === 0 && <tr><td colSpan={4} className="muted">这节课还没有学生。</td></tr>}
        </tbody>
      </table>
      {!occupants.every((o) => o.marked) && occupants.length > 0 && (
        <button className="btn btn-primary" disabled={busy} onClick={submit} style={{ marginTop: 10 }}>
          {busy ? "提交中…" : "提交点名（出勤照扣，缺勤也照扣）"}
        </button>
      )}
      {results && results.every((r) => r.ok) && <p className="notice">点名完成，课时已入账。</p>}
    </div>
  );
}
