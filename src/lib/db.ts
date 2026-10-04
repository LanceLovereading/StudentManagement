import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Neon 的 pooled 连接串经 PgBouncer（事务模式），Prisma 标准引擎必须带 pgbouncer=true。
// `neon link`/`neon deploy` 每次都会回写 .env 覆盖连接串——参数在这里统一追加，不依赖文件内容。
function datasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.includes("-pooler") || url.includes("pgbouncer=")) return url;
  return url + (url.includes("?") ? "&" : "?") + "pgbouncer=true";
}

export const db = globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: datasourceUrl() });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
