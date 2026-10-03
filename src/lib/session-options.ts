// 纯会话配置：不 import Prisma，供 middleware（Edge 运行时）与 Node 侧共用。
export type SessionData = {
  role?: "admin" | "user";
  id?: number;
  name?: string;
  level?: "SENIOR" | "JUNIOR";
};

export const sessionOptions = {
  password: process.env.SESSION_SECRET ?? "dev-only-secret-0123456789abcdef0123456789",
  cookieName: "austin-sms",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 3600,
  },
};
