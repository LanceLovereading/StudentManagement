import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import { db } from "./db";
import { RuleError } from "./errors";
import { sessionOptions, type SessionData } from "./session-options";

export { sessionOptions };
export type { SessionData };

export type AdminSession = { id: number; name: string; level: "SENIOR" | "JUNIOR" };
export type UserSession = { id: number; name: string };

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const s = await getSession();
  if (s.role !== "admin" || !s.id || !s.level) return null;
  return { id: s.id, name: s.name ?? "", level: s.level };
}

export async function getUserSession(): Promise<UserSession | null> {
  const s = await getSession();
  if (s.role !== "user" || !s.id) return null;
  return { id: s.id, name: s.name ?? "" };
}

// R6：junior 只能触碰自己名下的学生。所有学生查询/写入都过这个 where。
export function studentScope(admin: AdminSession): { ownerAdminId?: number } {
  return admin.level === "SENIOR" ? {} : { ownerAdminId: admin.id };
}

// R6（写路径版）：学生不可见 → NOT_FOUND；junior 越权 → FORBIDDEN
export async function assertStudentVisible(admin: AdminSession, userId: number) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { ownerAdminId: true } });
  if (!u) throw new RuleError("NOT_FOUND", "学生不存在");
  if (admin.level !== "SENIOR" && u.ownerAdminId !== admin.id) throw new Error("FORBIDDEN");
}

export async function assertVoucherVisible(admin: AdminSession, voucherId: number) {
  const v = await db.voucher.findUnique({
    where: { id: voucherId },
    include: { user: { select: { id: true, ownerAdminId: true, status: true, name: true } } },
  });
  if (!v) throw new RuleError("NOT_FOUND", "券不存在");
  if (admin.level !== "SENIOR" && v.user.ownerAdminId !== admin.id) throw new Error("FORBIDDEN");
  return v;
}
