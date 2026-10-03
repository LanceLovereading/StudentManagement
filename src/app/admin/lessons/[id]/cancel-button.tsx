"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";

export default function CancelLessonButton({ lessonId }: { lessonId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <span>
      <button
        className="btn btn-sm btn-danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            await post(`/api/lessons/${lessonId}/cancel`);
            router.refresh();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        取消课节（学校原因）
      </button>
      {err && <span className="muted" style={{ fontSize: 12 }}> {err}</span>}
    </span>
  );
}
