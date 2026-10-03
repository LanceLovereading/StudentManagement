import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

// 录入学生 → status=new（R14：录入是服务端驱动迁移的第一步）
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminSession();
    if (!admin) throw new Error("UNAUTHORIZED");
    const { name, phone, password } = (await req.json()) as { name?: string; phone?: string; password?: string };
    if (!name || !phone) throw new RuleError("BAD_REQUEST", "姓名和手机号必填");
    const dup = await db.user.findUnique({ where: { phone } });
    if (dup) throw new RuleError("PHONE_TAKEN", "该手机号已存在");
    const user = await db.user.create({
      data: {
        name,
        phone,
        passwordHash: bcrypt.hashSync(password || "demo1234", 8),
        ownerAdminId: admin.id,
        status: "new",
      },
    });
    return NextResponse.json({ ok: true, id: user.id });
  } catch (e) {
    return errorResponse(e);
  }
}
