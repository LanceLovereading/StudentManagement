import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession, assertStudentVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";
import { checkEnroll } from "@/lib/rules";

// 添加课（正式排班）：R1 循环冲突 + R3 余额门槛 + R7 未来 4 节逐节容量。
// 状态机不改状态——在读学生加课是日常操作；试听学生走转化事务（R10）。
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { userId, classId } = (await req.json()) as { userId?: number; classId?: number };
    if (!userId || !classId) throw new RuleError("BAD_REQUEST", "缺少学生或班级");
    await assertStudentVisible(admin, userId);

    await db.$transaction(async (tx) => {
      await checkEnroll(tx, userId, classId);
      await tx.studentTime.create({ data: { userId, classId, status: "ACTIVE" } });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
