import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <p className="font-display text-4xl tracking-tight">Chorégraphe</p>
      <h1 className="mt-6 text-xl">Créer un compte</h1>
      <p className="mt-1 text-sm text-muted">Le compte sert à enregistrer vos pièces et à recevoir des invitations.</p>
      <AuthForm mode="register" />
      <p className="mt-6 text-sm text-muted">
        Déjà inscrit ?{" "}
        <Link href="/connexion" className="text-curtain hover:underline">
          Se connecter
        </Link>
      </p>
    </main>
  );
}
