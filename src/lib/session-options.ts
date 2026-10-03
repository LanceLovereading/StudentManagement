// 纯会话配置：不 import Prisma，供 middleware（Edge 运行时）与 Node 侧共用。
export type SessionData = {
  role?: "admin" | "teacher" | "user" | "parent";
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
    // Secure 不能跟 NODE_ENV 走：本地是明文 HTTP，Safari 严格拒绝保存 Secure cookie，
    // 会话就永远立不住（Chrome/Firefox 对 localhost 网开一面，把这个差异藏住了）。
    // 由部署地址推导：本地 HTTP 不带，HTTPS 部署（设 APP_URL 或跑在 Vercel）自动开启。
    secure: process.env.APP_URL?.startsWith("https://") === true || process.env.VERCEL === "1",
    maxAge: 7 * 24 * 3600,
  },
};
