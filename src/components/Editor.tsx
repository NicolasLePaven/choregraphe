"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FrontStage } from "@/components/FrontStage";
import { StagePlan } from "@/components/StagePlan";
import { InvitePanel } from "@/components/InvitePanel";
import {
  buildTimeline,
  curveSamples,
  MAX_CURVE,
  nextColor,
  relabel,
  ROLE_LABELS,
  samplePositions,
  segmentAt,
  SHAPE_LABELS,
  stageOf,
  type ChoreographyDocument,
  type Dancer,
  type Formation,
} from "@/lib/domain";
import {
  clampToValid,
  migratePosition,
  resolvedStage,
  roundPoint,
  wingWaitingPoint,
  zoneLabel,
  zoneOf,
  type StageShape,
} from "@/lib/geometry";
import { stageFrom } from "@/lib/validate";

const SHAPES: StageShape[] = ["rectangle", "square", "oval", "circle"];

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12.5 9.5 17 19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function payloadOf(doc: ChoreographyDocument) {
  return {
    title: doc.title,
    stageShape: doc.stageShape,
    stageWidth: doc.stageWidth,
    stageDepth: doc.stageDepth,
    tempoTpm: doc.tempoTpm,
    dancers: doc.dancers,
    formations: doc.formations,
  };
}

export function Editor({ initial }: { initial: ChoreographyDocument }) {
  const [doc, setDoc] = useState(initial);
  const [selectedFormationId, setSelectedFormationId] = useState(initial.formations[0]?.id ?? "");
  const [selectedDancerId, setSelectedDancerId] = useState(initial.dancers[0]?.id ?? "");
  const [curveDancerIds, setCurveDancerIds] = useState<string[]>(() => (initial.dancers[0] ? [initial.dancers[0].id] : []));
  const [newName, setNewName] = useState("");
  const [nameEditId, setNameEditId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [preview, setPreview] = useState(false);
  const [faceView, setFaceView] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState("");
  const [shape, setShape] = useState<StageShape>(initial.stageShape);
  const [width, setWidth] = useState(initial.stageWidth);
  const [depth, setDepth] = useState(initial.stageDepth);
  const saved = useRef(JSON.stringify(payloadOf(initial)));
  const saveRequest = useRef(0);
  const canEdit = doc.role !== "viewer";
  const editing = canEdit && !preview && !faceView;
  const stage = stageOf(doc);
  const singleDimension = shape === "square" || shape === "circle";
  const timeline = useMemo(() => buildTimeline(doc.formations), [doc.formations]);
  const selectedFormation =
    doc.formations.find((formation) => formation.id === selectedFormationId) ?? doc.formations[0];
  const selectedDancer = doc.dancers.find((dancer) => dancer.id === selectedDancerId) ?? doc.dancers[0];

  const shown = useMemo(() => {
    if (preview) return samplePositions(beat, doc.formations, doc.dancers);
    const map = new Map<string, { x: number; y: number }>();
    for (const position of selectedFormation?.positions ?? []) map.set(position.dancerId, position);
    return map;
  }, [preview, beat, doc.formations, doc.dancers, selectedFormation]);
  const selectedPoint = selectedDancer ? shown.get(selectedDancer.id) : undefined;

  const serialized = useMemo(() => JSON.stringify(payloadOf(doc)), [doc]);

  useEffect(() => {
    if (!canEdit || serialized === saved.current) return;
    const handle = window.setTimeout(async () => {
      const requestId = saveRequest.current + 1;
      saveRequest.current = requestId;
      setStatus("saving");
      const response = await fetch(`/api/choregraphies/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: serialized,
      });
      if (requestId !== saveRequest.current) return;
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setStatus("error");
        setSaveError(data?.error ?? "Enregistrement impossible.");
        return;
      }
      saved.current = serialized;
      setStatus("saved");
      setSaveError("");
    }, 650);
    return () => window.clearTimeout(handle);
  }, [serialized, canEdit, doc.id]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let reachedEnd = false;
      setBeat((current) => {
        const next = current + dt * (doc.tempoTpm / 60);
        if (next >= timeline.totalBeats) {
          reachedEnd = true;
          return timeline.totalBeats;
        }
        return next;
      });
      if (reachedEnd) {
        setPlaying(false);
        return;
      }
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, doc.tempoTpm, timeline.totalBeats]);

  function updateFormation(formationId: string, recipe: (formation: Formation) => Formation) {
    setDoc((current) => ({
      ...current,
      formations: current.formations.map((formation) => (formation.id === formationId ? recipe(formation) : formation)),
    }));
  }

  function moveDancer(dancerId: string, point: { x: number; y: number }) {
    if (!selectedFormation || !editing) return;
    const rounded = roundPoint(clampToValid(point, stage));
    updateFormation(selectedFormation.id, (formation) => ({
      ...formation,
      positions: formation.positions.map((position) =>
        position.dancerId === dancerId ? { ...position, x: rounded.x, y: rounded.y } : position,
      ),
    }));
  }

  function addDancer() {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name || doc.dancers.length >= 30 || !editing) return;
    const dancer: Dancer = {
      id: crypto.randomUUID(),
      name,
      color: nextColor(doc.dancers.map((item) => item.color)),
      order: doc.dancers.length,
    };
    const point = wingWaitingPoint(doc.dancers.length, stage);
    setDoc((current) => ({
      ...current,
      dancers: [...current.dancers, dancer],
      formations: current.formations.map((formation) => ({
        ...formation,
        positions: [...formation.positions, { dancerId: dancer.id, x: point.x, y: point.y, curve: 0 }],
      })),
    }));
    setSelectedDancerId(dancer.id);
    setNewName("");
  }

  function beginNameEdit(dancer: Dancer) {
    if (!editing) return;
    setSelectedDancerId(dancer.id);
    setNameEditId(dancer.id);
    setNameDraft(dancer.name);
  }

  function cancelNameEdit() {
    setNameEditId(null);
    setNameDraft("");
  }

  function commitNameEdit() {
    const name = nameDraft.trim().replace(/\s+/g, " ");
    if (!nameEditId || name.length < 1 || name.length > 40) return;
    setDoc((current) => ({
      ...current,
      dancers: current.dancers.map((dancer) => (dancer.id === nameEditId ? { ...dancer, name } : dancer)),
    }));
    cancelNameEdit();
  }

  function addFormation(copyId?: string) {
    if (!editing) return;
    const source = doc.formations.find((formation) => formation.id === (copyId ?? selectedFormation?.id)) ?? doc.formations[0];
    if (!source) return;
    const created: Formation = {
      id: crypto.randomUUID(),
      order: source.order + 0.5,
      label: "",
      holdBeats: source.holdBeats,
      transitionBeats: source.transitionBeats,
      positions: source.positions.map((position) => ({ ...position, curve: position.curve ?? 0 })),
    };
    const formations = relabel([...doc.formations, created]);
    setDoc({ ...doc, formations });
    setSelectedFormationId(created.id);
    setPreview(false);
    setPlaying(false);
  }

  function deleteFormation(id: string) {
    if (!editing || doc.formations.length <= 1) return;
    const formations = relabel(doc.formations.filter((formation) => formation.id !== id));
    setDoc({ ...doc, formations });
    if (selectedFormationId === id) setSelectedFormationId(formations[0]?.id ?? "");
  }

  function moveFormation(id: string, direction: -1 | 1) {
    if (!editing) return;
    const ordered = doc.formations.slice().sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((formation) => formation.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const next = ordered.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setDoc({ ...doc, formations: relabel(next.map((formation, order) => ({ ...formation, order }))) });
  }

  function applyShape() {
    if (!editing) return;
    const nextDepth = singleDimension ? width : depth;
    if (width < 2 || width > 40 || nextDepth < 2 || nextDepth > 40) {
      setSaveError("Les dimensions doivent rester entre 2 et 40 mètres.");
      setStatus("error");
      return;
    }
    const next = stageFrom(shape, width, nextDepth);
    const current = stageOf(doc);
    setDoc((previous) => ({
      ...previous,
      stageShape: next.shape,
      stageWidth: next.width,
      stageDepth: next.depth,
      formations: previous.formations.map((formation) => ({
        ...formation,
        positions: formation.positions.map((position) => {
          const moved = roundPoint(migratePosition(position, current, next));
          return { ...position, x: moved.x, y: moved.y };
        }),
      })),
    }));
    setWidth(next.width);
    setDepth(next.depth);
  }

  function play() {
    setPreview(true);
    if (beat >= timeline.totalBeats) setBeat(0);
    setPlaying(true);
  }

  function toggleCurveDancer(dancerId: string) {
    if (!editing) return;
    setCurveDancerIds((current) =>
      current.includes(dancerId) ? current.filter((id) => id !== dancerId) : [...current, dancerId],
    );
  }

  function setCurve(curve: number) {
    if (!editing || !selectedFormation || curveDancerIds.length === 0) return;
    const next = Math.round(Math.max(-MAX_CURVE, Math.min(MAX_CURVE, curve)) * 10) / 10;
    const targets = new Set(curveDancerIds);
    updateFormation(selectedFormation.id, (formation) => ({
      ...formation,
      positions: formation.positions.map((position) =>
        targets.has(position.dancerId) ? { ...position, curve: next } : position,
      ),
    }));
  }

  const segment = preview ? segmentAt(beat, doc.formations) : null;
  const segmentFormation = segment
    ? doc.formations.find((formation) => formation.order === segment.formationIndex)
    : null;
  const phaseLabel =
    segment === null || !segmentFormation
      ? (selectedFormation?.label ?? "")
      : segment.phase === "hold"
        ? `${segmentFormation.label} · tenue`
        : `${segmentFormation.label} · déplacement`;
  const statusLabel = status === "saving" ? "Enregistrement…" : status === "error" ? "Non enregistré" : "Enregistré";
  const travels = useMemo(() => {
    const ordered = doc.formations.slice().sort((a, b) => a.order - b.order);
    const index = preview && segment ? segment.formationIndex : ordered.findIndex((formation) => formation.id === selectedFormation?.id);
    const from = ordered[index];
    const to = ordered[index + 1];
    if (!from || !to) return [];
    return doc.dancers.flatMap((dancer) => {
      const start = from.positions.find((position) => position.dancerId === dancer.id);
      const end = to.positions.find((position) => position.dancerId === dancer.id);
      if (!start || !end) return [];
      const origin = { x: start.x, y: start.y };
      const destination = { x: end.x, y: end.y };
      const curve = start.curve ?? 0;
      return [
        {
          dancerId: dancer.id,
          color: dancer.color,
          from: origin,
          to: destination,
          curve,
          samples: curveSamples(origin, destination, curve),
        },
      ];
    });
  }, [doc.dancers, doc.formations, preview, segment, selectedFormation?.id]);
  const curveTargets = doc.dancers.filter((dancer) => curveDancerIds.includes(dancer.id));
  const targetCurves = curveTargets.map(
    (dancer) => selectedFormation?.positions.find((position) => position.dancerId === dancer.id)?.curve ?? 0,
  );
  const sharedCurve = targetCurves.length > 0 && targetCurves.every((value) => value === targetCurves[0]) ? targetCurves[0] : null;
  const shownCurve = sharedCurve ?? targetCurves[0] ?? 0;

  return (
    <div className="flex h-[calc(100dvh-4rem)] w-full min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-paper-2 px-4 py-3">
        <Link href="/choregraphies" className="text-sm text-muted hover:text-ink">
          Retour
        </Link>
        <input
          value={doc.title}
          disabled={!editing}
          onChange={(event) => setDoc({ ...doc, title: event.target.value })}
          className="field max-w-xs font-display text-xl"
          aria-label="Titre"
        />
        <label className="flex items-center gap-2 text-sm">
          TPM
          <input
            type="number"
            min={40}
            max={240}
            step={1}
            disabled={!editing}
            value={doc.tempoTpm}
            onChange={(event) => {
              const tempo = Number(event.target.value);
              if (Number.isInteger(tempo) && tempo >= 40 && tempo <= 240) setDoc({ ...doc, tempoTpm: tempo });
            }}
            className="field w-24"
          />
        </label>
        <span className="text-xs text-muted">{ROLE_LABELS[doc.role]}</span>
        <span className={`text-xs ${status === "error" ? "text-curtain" : "text-muted"}`}>{canEdit ? statusLabel : "Lecture seule"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {doc.role === "owner" ? (
            <button type="button" className="btn-ghost" onClick={() => setInvitesOpen(true)}>
              Inviter
            </button>
          ) : null}
          <button type="button" className="btn-primary" onClick={() => (playing ? setPlaying(false) : play())}>
            {playing ? "Pause" : "Lecture"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setFaceView((current) => !current)}>
            {faceView ? "Plan" : "Vue spectateur"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setPlaying(false);
              setPreview(false);
              setBeat(0);
            }}
          >
            Stop
          </button>
        </div>
      </div>
      {saveError ? <p className="bg-paper px-4 py-2 text-sm text-curtain">{saveError}</p> : null}
      {doc.role === "viewer" ? (
        <p className="bg-paper px-4 py-2 text-sm text-muted">Lecture seule : parcours des tableaux et lecture, sans modification.</p>
      ) : null}
      {faceView ? (
        <p className="bg-paper px-4 py-2 text-sm text-muted">
          Vue spectateur depuis (0, −15). Rien n&apos;est modifiable.
        </p>
      ) : null}
      {preview ? (
        <p className="bg-paper px-4 py-2 text-sm text-muted">
          {phaseLabel} — temps {beat.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / {timeline.totalBeats}.
          {faceView ? "" : " Choisissez un tableau pour modifier le placement."}
        </p>
      ) : null}
      <div className="grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-h-[280px] min-w-0 p-3">
          {faceView ? (
            <FrontStage stage={stage} dancers={doc.dancers} positions={shown} />
          ) : (
            <StagePlan
              stage={stage}
              dancers={doc.dancers}
              positions={shown}
              selectedId={selectedDancer?.id ?? null}
              editable={editing}
              travels={travels}
              curveIds={curveDancerIds}
              onSelect={setSelectedDancerId}
              onMove={moveDancer}
              onCurve={(_dancerId, curve) => setCurve(curve)}
            />
          )}
        </div>
        <aside className="min-h-0 min-w-0 overflow-y-auto border-t border-line bg-paper-2 p-4 lg:border-t-0 lg:border-l">
          <h2 className="text-sm font-semibold">Danseurs</h2>
          <ul className="mt-3 grid gap-2">
            {doc.dancers.map((dancer) => (
              <li key={dancer.id} className="flex items-center gap-2">
                {editing && nameEditId === dancer.id ? (
                  <>
                    <input
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      maxLength={40}
                      autoFocus
                      className="field"
                      aria-label={`Nom de ${dancer.name}`}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitNameEdit();
                        }
                        if (event.key === "Escape") cancelNameEdit();
                      }}
                    />
                    <button type="button" className="btn-ghost h-10 w-10 shrink-0 px-0" aria-label="Valider le nom" onClick={commitNameEdit}>
                      <CheckIcon />
                    </button>
                    <button type="button" className="btn-ghost h-10 w-10 shrink-0 px-0" aria-label="Annuler" onClick={cancelNameEdit}>
                      <CrossIcon />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedDancerId(dancer.id)}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-2 py-2 text-left ${
                        dancer.id === selectedDancer?.id ? "border-curtain bg-paper" : "border-line"
                      }`}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: dancer.color }} />
                      <span className="truncate text-sm">{dancer.name}</span>
                    </button>
                    {editing ? (
                      <button
                        type="button"
                        className="btn-ghost h-10 w-10 shrink-0 px-0"
                        aria-label={`Modifier le nom de ${dancer.name}`}
                        onClick={() => beginNameEdit(dancer)}
                      >
                        <PencilIcon />
                      </button>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
          {selectedDancer && selectedPoint && selectedFormation ? (
            <div className="mt-4 grid gap-2">
              <p className="text-sm font-semibold">
                {selectedDancer.name} · {selectedFormation.label}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-sm">
                  x (m)
                  <input
                    type="number"
                    step={0.1}
                    disabled={!editing}
                    value={Number(selectedPoint.x.toFixed(2))}
                    className="field"
                    onChange={(event) => {
                      const x = Number(event.target.value);
                      if (Number.isFinite(x)) moveDancer(selectedDancer.id, { x, y: selectedPoint.y });
                    }}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  y (m)
                  <input
                    type="number"
                    step={0.1}
                    disabled={!editing}
                    value={Number(selectedPoint.y.toFixed(2))}
                    className="field"
                    onChange={(event) => {
                      const y = Number(event.target.value);
                      if (Number.isFinite(y)) moveDancer(selectedDancer.id, { x: selectedPoint.x, y });
                    }}
                  />
                </label>
              </div>
              <p className="text-sm text-muted">
                {preview && zoneOf(selectedPoint, stage) === "dehors"
                  ? "En déplacement"
                  : zoneLabel(zoneOf(selectedPoint, stage))}
              </p>
            </div>
          ) : null}
          {editing ? (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                addDancer();
              }}
            >
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Nom"
                maxLength={40}
                className="field"
                aria-label="Nom du nouveau danseur"
              />
              <button type="submit" className="btn-ghost" disabled={doc.dancers.length >= 30 || newName.trim() === ""}>
                Ajouter
              </button>
            </form>
          ) : null}
          <div className="mt-5 grid gap-3 border-t border-line pt-4">
            <h2 className="text-sm font-semibold">Forme pour toute la pièce</h2>
            <label className="grid gap-1 text-sm">
              Forme
              <select
                value={shape}
                disabled={!editing}
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
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-sm">
                {shape === "square" ? "Côté" : shape === "circle" ? "Diamètre" : "Largeur"}
                <input
                  type="number"
                  min={2}
                  max={40}
                  step={0.5}
                  disabled={!editing}
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                  className="field"
                />
              </label>
              {singleDimension ? null : (
                <label className="grid gap-1 text-sm">
                  Profondeur
                  <input
                    type="number"
                    min={2}
                    max={40}
                    step={0.5}
                    disabled={!editing}
                    value={depth}
                    onChange={(event) => setDepth(Number(event.target.value))}
                    className="field"
                  />
                </label>
              )}
            </div>
            <button type="button" className="btn-ghost justify-self-start" disabled={!editing} onClick={applyShape}>
              Appliquer à toute la chorégraphie
            </button>
            <p className="text-xs text-muted">
              Scène actuelle : {SHAPE_LABELS[doc.stageShape]}, {resolvedStage(stage).width} × {resolvedStage(stage).depth} m. Origine au centre, y vers le fond.
            </p>
          </div>
        </aside>
      </div>
      <div className="border-t border-line bg-paper-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {doc.formations
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((formation) => {
              const active = preview
                ? segment?.formationIndex === formation.order
                : formation.id === selectedFormation?.id;
              return (
                <button
                  key={formation.id}
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setPreview(false);
                    setSelectedFormationId(formation.id);
                  }}
                  className={`rounded-full px-3 py-1 text-sm ${active ? "bg-curtain text-white" : "bg-paper text-ink"}`}
                >
                  {formation.label}
                </button>
              );
            })}
          {editing ? (
            <button type="button" className="btn-ghost" onClick={() => addFormation()}>
              Ajouter un tableau
            </button>
          ) : null}
        </div>
        {selectedFormation ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Tenue (temps)
              <input
                type="number"
                min={1}
                max={128}
                step={1}
                disabled={!editing}
                value={selectedFormation.holdBeats}
                onChange={(event) => {
                  const holdBeats = Number(event.target.value);
                  if (!Number.isInteger(holdBeats) || holdBeats < 1 || holdBeats > 128) return;
                  updateFormation(selectedFormation.id, (formation) => ({ ...formation, holdBeats }));
                }}
                className="field w-28"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Déplacement (temps)
              <input
                type="number"
                min={1}
                max={128}
                step={1}
                disabled={!editing}
                value={selectedFormation.transitionBeats}
                onChange={(event) => {
                  const transitionBeats = Number(event.target.value);
                  if (!Number.isInteger(transitionBeats) || transitionBeats < 1 || transitionBeats > 128) return;
                  updateFormation(selectedFormation.id, (formation) => ({ ...formation, transitionBeats }));
                }}
                className="field w-28"
              />
            </label>
            {selectedFormation.order < doc.formations.length - 1 ? (
              <div className="grid gap-1 text-sm">
                <span>Courbure (m)</span>
                <div className="flex flex-wrap gap-1">
                  {doc.dancers.map((dancer) => {
                    const on = curveDancerIds.includes(dancer.id);
                    return (
                      <button
                        key={dancer.id}
                        type="button"
                        aria-pressed={on}
                        disabled={!editing}
                        onClick={() => toggleCurveDancer(dancer.id)}
                        className={`rounded-full border px-2.5 py-1 text-sm ${on ? "border-curtain bg-curtain text-white" : "border-line bg-white text-ink"}`}
                      >
                        {dancer.name}
                      </button>
                    );
                  })}
                </div>
                {curveTargets.length === 0 ? (
                  <p className="text-sm text-muted">Choisissez les danseurs concernés.</p>
                ) : targetCurves.every((value) => value === 0) && !editing ? (
                  <p className="text-sm text-muted">Ligne droite</p>
                ) : targetCurves.every((value) => value === 0) ? (
                  <button type="button" className="btn-ghost justify-self-start" onClick={() => setCurve(2)}>
                    Ajouter une courbe
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={-MAX_CURVE}
                      max={MAX_CURVE}
                      step={0.1}
                      disabled={!editing}
                      value={shownCurve}
                      aria-label="Courbure du déplacement"
                      className="w-36"
                      onChange={(event) => setCurve(Number(event.target.value))}
                    />
                    <input
                      type="number"
                      min={-MAX_CURVE}
                      max={MAX_CURVE}
                      step={0.1}
                      disabled={!editing}
                      value={shownCurve}
                      aria-label="Courbure en mètres"
                      className="field"
                      style={{ width: "4.5rem", paddingInline: "0.35rem", textAlign: "center", flexShrink: 0 }}
                      onChange={(event) => {
                        const curve = Number(event.target.value);
                        if (Number.isFinite(curve)) setCurve(curve);
                      }}
                    />
                    {editing ? (
                      <button type="button" className="btn-ghost" onClick={() => setCurve(0)}>
                        Ligne droite
                      </button>
                    ) : null}
                  </div>
                )}
                {sharedCurve === null ? <p className="text-xs text-muted">Ces danseurs n'ont pas la même courbure.</p> : null}
                <p className="max-w-sm text-xs text-muted">
                  La valeur s'applique aux danseurs choisis, pour le déplacement vers le tableau suivant. 0 m suit la ligne droite. Le signe choisit le côté.
                </p>
              </div>
            ) : null}
            {editing ? (
              <>
                <button type="button" className="btn-ghost" onClick={() => moveFormation(selectedFormation.id, -1)}>
                  Déplacer avant
                </button>
                <button type="button" className="btn-ghost" onClick={() => moveFormation(selectedFormation.id, 1)}>
                  Déplacer après
                </button>
                <button type="button" className="btn-ghost" onClick={() => addFormation(selectedFormation.id)}>
                  Dupliquer
                </button>
                <button type="button" className="btn-ghost" onClick={() => deleteFormation(selectedFormation.id)} disabled={doc.formations.length <= 1}>
                  Supprimer
                </button>
              </>
            ) : null}
            <label className="ml-auto grid min-w-48 flex-1 gap-1 text-sm">
              Lecture
              <input
                type="range"
                min={0}
                max={timeline.totalBeats}
                step={0.05}
                value={Math.min(beat, timeline.totalBeats)}
                onChange={(event) => {
                  setPlaying(false);
                  setPreview(true);
                  setBeat(Number(event.target.value));
                }}
              />
            </label>
          </div>
        ) : null}
      </div>
      {invitesOpen ? <InvitePanel choreographyId={doc.id} onClose={() => setInvitesOpen(false)} /> : null}
    </div>
  );
}
