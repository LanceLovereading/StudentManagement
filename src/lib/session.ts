import { getIronSession, IronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  role?: "admin" | "user";
  id?: number;
  name?: string;
  level?: "SENIOR" | "JUNIOR";
};

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? "dev-only-secret-0123456789abcdef0123456789",
  cookieName: "austin-sms",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 3600,
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export type AdminSession = { id: number; name: string; level: "SENIOR" | "JUNIOR" };
export type UserSession = { id: number; name: string };

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
