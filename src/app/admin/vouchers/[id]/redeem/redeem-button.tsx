"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";

export default function RedeemButton({ voucherId, classId, studentId, disabled }: { voucherId: number; classId: number; studentId: number; disabled?: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <span>
      <button
        className="btn btn-sm btn-primary"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            await post(`/api/vouchers/${voucherId}/redeem`, { classId });
            router.push(`/admin/students/${studentId}`);
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "兑换中…" : "兑换"}
      </button>
      {err && <span className="muted" style={{ fontSize: 12 }}> {err}</span>}
    </span>
  );
}
