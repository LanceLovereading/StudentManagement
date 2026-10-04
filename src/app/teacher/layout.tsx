import { redirect } from "next/navigation";
import { getTeacherSession } from "@/lib/session";
import { LogoutButton } from "../admin/chrome";
import { TeacherNav } from "./nav";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const teacher = await getTeacherSession();
  if (!teacher) redirect("/login");
  return (
    <>
      <header className="topbar">
        <span className="brand">Austin Edu</span>
        <TeacherNav />
        <span className="who" style={{ flex: 1 }}>{teacher.name} 老师</span>
        <LogoutButton />
      </header>
      <div className="container">{children}</div>
    </>
  );
}
