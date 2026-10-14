import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DeleteChoreographyButton } from "@/components/DeleteChoreographyButton";
import { getSession } from "@/lib/auth";
import { listChoreographies } from "@/lib/access";
import { ROLE_LABELS, SHAPE_LABELS } from "@/lib/domain";

export default async function ChoreographiesPage() {
  const session = await getSession();
  if (!session) redirect("/connexion");
  const items = await listChoreographies(session.userId);
  const formatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl tracking-tight">Chorégraphies</h1>
            <p className="mt-1 text-sm text-muted">Pièces créées et invitations reçues.</p>
          </div>
          <Link href="/choregraphies/nouvelle" className="btn-primary">
            Nouvelle chorégraphie
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-line bg-paper-2 p-8 text-muted">
            Aucune chorégraphie pour le moment.
          </p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col rounded-2xl border border-line bg-paper-2 p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/choregraphies/${item.id}`} className="font-display text-2xl hover:text-curtain">
                    {item.title}
                  </Link>
                  <span className="rounded-full bg-paper px-2 py-1 text-xs text-muted">{ROLE_LABELS[item.role]}</span>
                </div>
                <p className="mt-3 text-sm text-muted">
                  {`${SHAPE_LABELS[item.stageShape]} · ${item.dancerCount} danseur${item.dancerCount > 1 ? "s" : ""} · ${item.tempoTpm} TPM`}
                </p>
                <p className="mt-1 text-xs text-muted">Modifiée le {formatter.format(new Date(item.updatedAt))}</p>
                <div className="mt-4 flex items-center justify-between">
                  <Link href={`/choregraphies/${item.id}`} className="text-sm font-medium text-ink hover:underline">
                    Ouvrir
                  </Link>
                  {item.role === "owner" ? <DeleteChoreographyButton id={item.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
