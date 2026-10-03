import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    if (admin.level !== "SENIOR") throw new Error("FORBIDDEN");
    const { id } = (await req.json()) as { id?: number };
    if (!id) throw new RuleError("BAD_REQUEST", "缺少模板 id");
    await db.classTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
