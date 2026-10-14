"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function AppHeader({ name }: { name: string }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/connexion");
    router.refresh();
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-line bg-paper-2 px-4 sm:px-6">
      <Link href="/choregraphies" className="font-display text-2xl tracking-tight text-ink">
        Chorégraphe
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <span className="hidden text-muted sm:inline">{name}</span>
        <button type="button" onClick={logout} className="text-curtain hover:underline">
          Déconnexion
        </button>
      </div>
    </header>
  );
}
