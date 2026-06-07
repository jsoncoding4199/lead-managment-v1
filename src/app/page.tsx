import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function Root() {
  const user = await currentUser();
  redirect(user ? "/dashboard" : "/login");
}
