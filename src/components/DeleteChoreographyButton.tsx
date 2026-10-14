"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteChoreographyButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!window.confirm("Supprimer cette chorégraphie ?")) return;
    setPending(true);
    const response = await fetch(`/api/choregraphies/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setPending(false);
      window.alert("La suppression a échoué.");
      return;
    }
    router.refresh();
  }

  return (
    <button type="button" onClick={onClick} disabled={pending} className="text-sm text-curtain hover:underline">
      {pending ? "Suppression…" : "Supprimer"}
    </button>
  );
}
