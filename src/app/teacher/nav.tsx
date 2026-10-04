"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["/teacher", "我的课表"],
  ["/teacher/availability", "可上课时间"],
] as const;

// 教师端常驻导航：点名/登记可上课时间后都能一键回到另一端。
export function TeacherNav() {
  const path = usePathname();
  return (
    <nav>
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} className={path === href || (href !== "/teacher" && path.startsWith(href)) ? "active" : ""}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
