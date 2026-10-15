"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DuplicateChoreographyButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const response = await fetch(`/api/choregraphies/${id}/duplicate`, { method: "POST" });
    if (!response.ok) {
      setPending(false);
      window.alert("La duplication a échoué.");
      return;
    }
    router.refresh();
    setPending(false);
  }

  return (
    <button type="button" onClick={onClick} disabled={pending} className="text-sm font-medium text-ink hover:underline">
      {pending ? "Duplication…" : "Dupliquer"}
    </button>
  );
}
