"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

type TeacherOption = { id: number; name: string };

function ClassFields({ teachers, subjects, initial }: {
  teachers: TeacherOption[];
  subjects: string[];
  initial?: {
    name: string; subject: string; yearLevel: number; teacherId: number;
    weekday: number; startMin: number; endMin: number; capacity: number;
  };
}) {
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return (
    <>
      <div className="field"><label>班级名</label><input name="name" className="input" required defaultValue={initial?.name} placeholder="Y10 数学C" /></div>
      <div className="field">
        <label>科目</label>
        <input name="subject" className="input" required list="subject-list" defaultValue={initial?.subject} />
        <datalist id="subject-list">
          {subjects.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>
      <div className="field">
        <label>年级</label>
        <select name="yearLevel" className="select" defaultValue={initial?.yearLevel ?? 10}>
          {[7, 8, 9, 10, 11, 12].map((y) => <option key={y} value={y}>Y{y}</option>)}
        </select>
      </div>
      <div className="field">
        <label>教师</label>
        <select name="teacherId" className="select" defaultValue={initial?.teacherId}>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>周几</label>
        <select name="weekday" className="select" defaultValue={initial?.weekday ?? 1}>
          {WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
        </select>
      </div>
      <div className="field"><label>开始</label><input name="start" type="time" className="input" required defaultValue={initial ? fmt(initial.startMin) : "16:30"} /></div>
      <div className="field"><label>结束</label><input name="end" type="time" className="input" required defaultValue={initial ? fmt(initial.endMin) : "18:00"} /></div>
      <div className="field"><label>容量</label><input name="capacity" type="number" min={1} className="input" required defaultValue={initial?.capacity ?? 12} /></div>
    </>
  );
}

export function CreateClassForm({ teachers, subjects }: { teachers: TeacherOption[]; subjects: string[] }) {
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
          await post("/api/classes", {
            name: f.get("name"), subject: f.get("subject"), yearLevel: Number(f.get("yearLevel")),
            teacherId: Number(f.get("teacherId")), weekday: Number(f.get("weekday")),
            startMin: toMin(String(f.get("start"))), endMin: toMin(String(f.get("end"))),
            capacity: Number(f.get("capacity")),
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
      <ClassFields teachers={teachers} subjects={subjects} />
      <div style={{ width: "100%" }}>
        <button className="btn btn-primary" disabled={busy}>建班（R2 教师不撞班 · R12b 落在可用窗内）</button>
        {err && <span className="err" style={{ margin: 0 }}> {err}</span>}
      </div>
    </form>
  );
}

export function EditClassForm({ classId, teachers, subjects, initial }: {
  classId: number;
  teachers: TeacherOption[];
  subjects: string[];
  initial: { name: string; subject: string; yearLevel: number; teacherId: number; weekday: number; startMin: number; endMin: number; capacity: number };
}) {
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
          await post(`/api/classes/${classId}/update`, {
            name: f.get("name"), subject: f.get("subject"), yearLevel: Number(f.get("yearLevel")),
            teacherId: Number(f.get("teacherId")), weekday: Number(f.get("weekday")),
            startMin: toMin(String(f.get("start"))), endMin: toMin(String(f.get("end"))),
            capacity: Number(f.get("capacity")),
          });
          router.refresh();
        } catch (ex) {
          setErr((ex as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <ClassFields teachers={teachers} subjects={subjects} initial={initial} />
      <div style={{ width: "100%" }}>
        <button className="btn btn-primary" disabled={busy}>保存改动（自动校验在读学生不撞班）</button>
        {err && <span className="err" style={{ margin: 0 }}> {err}</span>}
      </div>
    </form>
  );
}

export function ClassStatusButton({ classId, status }: { classId: number; status: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const next = status === "OPEN" ? "CLOSED" : "OPEN";
  return (
    <span>
      <button
        className={`btn btn-sm ${status === "OPEN" ? "btn-danger" : ""}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            await post(`/api/classes/${classId}/status`, { status: next });
            router.refresh();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {status === "OPEN" ? "停开此班" : "重新开班"}
      </button>
      {err && <span className="muted" style={{ fontSize: 12 }}> {err}</span>}
    </span>
  );
}
