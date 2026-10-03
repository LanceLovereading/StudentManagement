import { NextResponse } from "next/server";

// 业务规则拒绝：带机器可读原因码（破坏测试断言用）
export class RuleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof RuleError) {
    return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: 422 });
  }
  if (typeof e === "object" && e && (e as { code?: string }).code === "P2002") {
    // 唯一索引兜底（R8 / ACTIVE 报名唯一 / caiwu 幂等锚）
    return NextResponse.json({ ok: false, code: "DUPLICATE", message: "唯一性约束：同一事件只能发生一次" }, { status: 422 });
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "UNAUTHORIZED" || msg === "FORBIDDEN") {
    return NextResponse.json({ ok: false, code: msg, message: msg === "UNAUTHORIZED" ? "未登录" : "无权限" }, { status: msg === "UNAUTHORIZED" ? 401 : 403 });
  }
  console.error("[internal]", e);
  return NextResponse.json({ ok: false, code: "INTERNAL", message: msg }, { status: 500 });
}
