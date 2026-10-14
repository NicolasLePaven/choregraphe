"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StageShape } from "@/lib/geometry";
import { SHAPE_LABELS } from "@/lib/domain";

const SHAPES: StageShape[] = ["rectangle", "square", "oval", "circle"];

export function CreateForm() {
  const router = useRouter();
  const [shape, setShape] = useState<StageShape>("rectangle");
  const [names, setNames] = useState(["Danseur 1"]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const singleDimension = shape === "square" || shape === "circle";

  function updateName(index: number, value: string) {
    setNames((current) => current.map((name, nameIndex) => (nameIndex === index ? value : name)));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const width = Number(form.get("width"));
    const depth = singleDimension ? width : Number(form.get("depth"));
    setPending(true);
    const response = await fetch("/api/choregraphies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        stageShape: shape,
        stageWidth: width,
        stageDepth: depth,
        tempoTpm: Number(form.get("tempo")),
        dancers: names.map((name) => ({ name })),
      }),
    });
    const data = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!response.ok || !data?.id) {
      setPending(false);
      setError(data?.error ?? "La création a échoué.");
      return;
    }
    router.push(`/choregraphies/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 grid max-w-xl gap-5">
      <label className="grid gap-1 text-sm">
        Titre
        <input name="title" required maxLength={80} className="field" placeholder="Ouverture" />
      </label>
      <label className="grid gap-1 text-sm">
        Forme de la scène
        <select
          value={shape}
          onChange={(event) => setShape(event.target.value as StageShape)}
          className="field"
        >
          {SHAPES.map((item) => (
            <option key={item} value={item}>
              {SHAPE_LABELS[item]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          {shape === "square" ? "Côté (m)" : shape === "circle" ? "Diamètre (m)" : "Largeur (m)"}
          <input name="width" type="number" min={2} max={40} step={0.5} defaultValue={12} required className="field" />
        </label>
        {singleDimension ? null : (
          <label className="grid gap-1 text-sm">
            Profondeur (m)
            <input name="depth" type="number" min={2} max={40} step={0.5} defaultValue={8} required className="field" />
          </label>
        )}
        <label className="grid gap-1 text-sm">
          Vitesse (TPM)
          <input name="tempo" type="number" min={40} max={240} step={1} defaultValue={120} required className="field" />
        </label>
      </div>
      <fieldset className="grid gap-3">
        <legend className="text-sm">Danseurs</legend>
        {names.map((name, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={name}
              onChange={(event) => updateName(index, event.target.value)}
              required
              maxLength={40}
              className="field"
              aria-label={`Nom du danseur ${index + 1}`}
            />
            {names.length > 1 ? (
              <button type="button" className="btn-ghost" onClick={() => setNames(names.filter((_, i) => i !== index))}>
                Retirer
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="btn-ghost justify-self-start"
          disabled={names.length >= 30}
          onClick={() => setNames([...names, `Danseur ${names.length + 1}`])}
        >
          Ajouter un danseur
        </button>
      </fieldset>
      {error ? <p className="text-sm text-curtain">{error}</p> : null}
      <button type="submit" className="btn-primary justify-self-start" disabled={pending}>
        {pending ? "Création…" : "Créer"}
      </button>
    </form>
  );
}
