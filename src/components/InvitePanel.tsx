"use client";

import { useEffect, useState } from "react";
import type { MemberRecord } from "@/lib/domain";

export function InvitePanel({ choreographyId, onClose }: { choreographyId: string; onClose: () => void }) {
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function loadMembers() {
    const response = await fetch(`/api/choregraphies/${choreographyId}/members`);
    const data = (await response.json().catch(() => null)) as { members?: MemberRecord[]; error?: string } | null;
    if (!response.ok) {
      setError(data?.error ?? "Impossible de charger les invitations.");
      return;
    }
    setMembers(data?.members ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/choregraphies/${choreographyId}/members`);
      const data = (await response.json().catch(() => null)) as { members?: MemberRecord[]; error?: string } | null;
      if (cancelled) return;
      if (!response.ok) {
        setError(data?.error ?? "Impossible de charger les invitations.");
        return;
      }
      setMembers(data?.members ?? []);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [choreographyId]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch(`/api/choregraphies/${choreographyId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(data?.error ?? "Invitation impossible.");
      return;
    }
    setEmail("");
    await loadMembers();
  }

  async function updateRole(member: MemberRecord, nextRole: "viewer" | "editor") {
    const response = await fetch(`/api/choregraphies/${choreographyId}/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    if (!response.ok) {
      setError("Le droit n’a pas pu être modifié.");
      return;
    }
    await loadMembers();
  }

  async function revoke(member: MemberRecord) {
    if (!window.confirm(`Retirer l’accès de ${member.email} ?`)) return;
    const response = await fetch(`/api/choregraphies/${choreographyId}/members/${member.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("L’accès n’a pas pu être retiré.");
      return;
    }
    await loadMembers();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-paper-2 p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Invitations</h2>
            <p className="mt-1 text-sm text-muted">
              Lecture seule ou édition. Sans compte, l’invitation s’active à l’inscription avec la même adresse.
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
        <form onSubmit={invite} className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            Adresse e-mail
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="field" />
          </label>
          <label className="grid gap-1 text-sm">
            Droit
            <select value={role} onChange={(event) => setRole(event.target.value as "viewer" | "editor")} className="field">
              <option value="viewer">Lecture seule</option>
              <option value="editor">Édition</option>
            </select>
          </label>
          {error ? <p className="text-sm text-curtain">{error}</p> : null}
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Invitation…" : "Inviter"}
          </button>
        </form>
        <ul className="mt-5 divide-y divide-line">
          {members.length === 0 ? <li className="py-3 text-sm text-muted">Aucune invitation.</li> : null}
          {members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">{member.name ?? member.email}</p>
                <p className="text-xs text-muted">
                  {member.email}
                  {member.pending ? " · en attente d’inscription" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={member.role}
                  onChange={(event) => updateRole(member, event.target.value as "viewer" | "editor")}
                  className="field w-auto py-1"
                  aria-label={`Droit de ${member.email}`}
                >
                  <option value="viewer">Lecture seule</option>
                  <option value="editor">Édition</option>
                </select>
                <button type="button" className="text-sm text-curtain" onClick={() => revoke(member)}>
                  Retirer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
