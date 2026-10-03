import { redirect } from "next/navigation";
import { getAdminSession, getUserSession } from "@/lib/session";

export default async function Home() {
  if (await getAdminSession()) redirect("/admin");
  if (await getUserSession()) redirect("/my");
  redirect("/login");
}
