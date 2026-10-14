import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <p className="font-display text-3xl text-ink">Introuvable</p>
      <p className="mt-2 text-muted">Cette page ou cette chorégraphie n’existe pas.</p>
      <Link href="/choregraphies" className="mt-6 text-curtain underline-offset-4 hover:underline">
        Retour aux chorégraphies
      </Link>
    </main>
  );
}
