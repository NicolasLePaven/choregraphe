"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const isRegister = mode === "register";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (isRegister && password !== String(form.get("confirm") ?? "")) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setPending(true);
    const response = await fetch(isRegister ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password,
        name: form.get("name"),
      }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setPending(false);
      setError(data?.error ?? "Impossible de continuer.");
      return;
    }
    router.push("/choregraphies");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
      {isRegister ? (
        <label className="flex flex-col gap-1 text-sm">
          Nom
          <input name="name" required maxLength={60} className="field" autoComplete="name" />
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        E-mail
        <input name="email" type="email" required className="field" autoComplete="email" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Mot de passe
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="field"
          autoComplete={isRegister ? "new-password" : "current-password"}
        />
      </label>
      {isRegister ? (
        <label className="flex flex-col gap-1 text-sm">
          Confirmer le mot de passe
          <input name="confirm" type="password" required minLength={8} className="field" autoComplete="new-password" />
        </label>
      ) : null}
      {error ? <p className="text-sm text-curtain">{error}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Patientez…" : isRegister ? "Créer le compte" : "Se connecter"}
      </button>
    </form>
  );
}
