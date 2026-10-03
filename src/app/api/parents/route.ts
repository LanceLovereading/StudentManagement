import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getAdminSession, assertStudentVisible } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

// 关联家长：按手机号找家长，没有则建档（初始密码 parent123），再建立多对多关系。
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { studentId, phone, name, relation } = (await req.json()) as {
      studentId?: number; phone?: string; name?: string; relation?: string;
    };
    if (!studentId || !phone) throw new RuleError("BAD_REQUEST", "缺少学生或手机号");
    await assertStudentVisible(admin, studentId);

    let parent = await db.parent.findUnique({ where: { phone } });
    if (!parent) {
      parent = await db.parent.create({
        data: { name: name || "家长", phone, passwordHash: bcrypt.hashSync("parent123", 8) },
      });
    }
    const existing = await db.studentParent.findUnique({
      where: { studentId_parentId: { studentId, parentId: parent.id } },
    });
    if (existing) throw new RuleError("ALREADY_LINKED", "该家长已关联此学生");
    await db.studentParent.create({
      data: { studentId, parentId: parent.id, relation: relation || "OTHER", isPrimary: false },
    });
    return NextResponse.json({ ok: true, parentId: parent.id, created: true });
  } catch (e) {
    return errorResponse(e);
  }
}
