import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { AdminNav, LogoutButton } from "./chrome";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");
  return (
    <>
      <header className="topbar">
        <span className="brand">Austin Edu</span>
        <AdminNav />
        <span className="who">
          {admin.name} · {admin.level === "SENIOR" ? "senior" : "junior"}
        </span>
        <LogoutButton />
      </header>
      <div className="container">{children}</div>
    </>
  );
}
