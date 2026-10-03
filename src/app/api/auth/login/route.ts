import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { RuleError, errorResponse } from "@/lib/errors";

// 四角色统一登录：admin 用户名 / teacher·user·parent 手机号。
// 输入容错：去首尾空格（含全角空格）、全角数字转半角——中文输入法下的常见失误不挡人。
function normalizeAccount(raw: string): string {
  return raw
    .replace(/[\u3000]/g, " ")
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

export async function POST(req: NextRequest) {
  try {
    const { role, account: rawAccount, password } = (await req.json()) as { role?: string; account?: string; password?: string };
    const account = rawAccount ? normalizeAccount(rawAccount) : "";
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

    if (role === "teacher") {
      const teacher = await db.teacher.findUnique({ where: { phone: account } });
      if (!teacher || !bcrypt.compareSync(password, teacher.passwordHash)) throw new RuleError("BAD_CREDENTIALS", "手机号或密码错误");
      const s = await getSession();
      s.role = "teacher";
      s.id = teacher.id;
      s.name = teacher.name;
      await s.save();
      return NextResponse.json({ ok: true, redirect: "/teacher" });
    }

    if (role === "parent") {
      const parent = await db.parent.findUnique({ where: { phone: account } });
      if (!parent || !bcrypt.compareSync(password, parent.passwordHash)) throw new RuleError("BAD_CREDENTIALS", "手机号或密码错误");
      const s = await getSession();
      s.role = "parent";
      s.id = parent.id;
      s.name = parent.name;
      await s.save();
      return NextResponse.json({ ok: true, redirect: "/parent" });
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
