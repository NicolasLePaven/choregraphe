import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Editor } from "@/components/Editor";
import { loadChoreography, toDocument } from "@/lib/access";
import { getSession } from "@/lib/auth";

export default async function ChoreographyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/connexion");
  const { id } = await params;
  const loaded = await loadChoreography(id, session.userId);
  if (!loaded) notFound();
  return (
    <AppShell>
      <Editor initial={toDocument(loaded.choreography, loaded.role)} />
    </AppShell>
  );
}
