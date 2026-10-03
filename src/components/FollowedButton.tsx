"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";

export default function FollowedButton({ voucherId }: { voucherId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <>
      <button
        className="btn btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            await post(`/api/vouchers/${voucherId}/followed`);
            router.refresh();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        标记已跟进
      </button>
      {err && <span className="muted" style={{ fontSize: 12 }}>{err}</span>}
    </>
  );
}
