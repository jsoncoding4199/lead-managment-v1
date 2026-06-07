import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSession } from "./session";

export type CurrentUser = {
  id: number;
  username: string;
  displayName: string;
  role: "MASTER" | "USER";
};

export async function currentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, displayName: true, role: true, active: true },
  });
  if (!user || !user.active) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireMaster(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "MASTER") redirect("/dashboard");
  return user;
}
