import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const { role, account, password } = (await req.json()) as { role?: string; account?: string; password?: string };
    if (!account || !password) throw new RuleError("BAD_REQUEST", "请输入账号和密码");

    if (role === "user") {
      const user = await db.user.findUnique({ where: { phone: account } });
      if (!user || !bcrypt.compareSync(password, user.passwordHash)) throw new RuleError("BAD_CREDENTIALS", "手机号或密码错误");
      const s = await getSession();
      s.role = "user";
      s.id = user.id;
      s.name = user.name;
      await s.save();
      return NextResponse.json({ ok: true, redirect: "/my" });
    }

    const admin = await db.admin.findUnique({ where: { name: account } });
    if (!admin || !bcrypt.compareSync(password, admin.passwordHash)) throw new RuleError("BAD_CREDENTIALS", "用户名或密码错误");
    const s = await getSession();
    s.role = "admin";
    s.id = admin.id;
    s.name = admin.name;
    s.level = admin.level as "SENIOR" | "JUNIOR";
    await s.save();
    return NextResponse.json({ ok: true, redirect: "/admin" });
  } catch (e) {
    return errorResponse(e);
  }
}
