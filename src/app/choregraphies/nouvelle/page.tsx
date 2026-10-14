import { AppShell } from "@/components/AppShell";
import { CreateForm } from "@/components/CreateForm";

export default function NewChoreographyPage() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-4xl tracking-tight">Nouvelle chorégraphie</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Le nombre de danseurs et la forme pourront encore changer ensuite. La forme reste la même pour tous les tableaux.
        </p>
        <CreateForm />
      </main>
    </AppShell>
  );
}
