import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppHeader } from "./AppHeader";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/connexion");
  return (
    <div className="min-h-dvh">
      <AppHeader name={session.name} />
      {children}
    </div>
  );
}
