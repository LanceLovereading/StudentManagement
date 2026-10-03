import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session-options";

// HTTP 层的会话门：/admin 需要 admin 会话，/my 需要 user 会话。
// 数据本身的行级过滤（R6）在各页面的查询与 API 路由里强制——这里只是把
// "未登录访问受保护页" 变成干净的 307，而不是渲染后再前端跳转。
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname.startsWith("/teacher") && session.role !== "teacher") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname === "/my" && session.role !== "user") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname === "/parent" && session.role !== "parent") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/my", "/parent"],
};
