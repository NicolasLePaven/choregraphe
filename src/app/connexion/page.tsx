import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <p className="font-display text-4xl tracking-tight">Chorégraphe</p>
      <h1 className="mt-6 text-xl">Connexion</h1>
      <p className="mt-1 text-sm text-muted">Retrouvez vos chorégraphies et celles qui vous sont partagées.</p>
      <AuthForm mode="login" />
      <p className="mt-6 text-sm text-muted">
        Pas encore de compte ?{" "}
        <Link href="/inscription" className="text-curtain hover:underline">
          Créer un compte
        </Link>
      </p>
    </main>
  );
}
