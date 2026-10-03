"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const ITEMS = [
  ["/admin", "工作台"],
  ["/admin/classes", "排班表"],
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav>
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} className={path === href || (href !== "/admin" && path.startsWith(href)) ? "active" : ""}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-sm"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
      }}
    >
      退出
    </button>
  );
}
