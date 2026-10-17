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
  type Point,
  type Stage,
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" strokeLinecap="round" />
      <path d="M9 7V5h6v2" strokeLinejoin="round" />
      <path d="M6.5 7l.8 12h9.4l.8-12" strokeLinejoin="round" />
      <path d="M10 11v5M14 11v5" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M6 5h4.2v14H6zm7.8 0H18v14h-4.2Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" fill="currentColor" />
    </svg>
  );
}

function groupDelta(origins: Point[], delta: Point, stage: Stage): Point {
  const fits = (scale: number) =>
    origins.every((origin) => {
      const moved = roundPoint({ x: origin.x + delta.x * scale, y: origin.y + delta.y * scale });
      return zoneOf(moved, stage) !== "dehors";
    });
  if (fits(1)) return delta;
  if (!fits(0)) return { x: 0, y: 0 };
  let low = 0;
  let high = 1;
  for (let step = 0; step < 16; step += 1) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return { x: delta.x * low, y: delta.y * low };
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

function samePayload(a: ChoreographyDocument, b: ChoreographyDocument) {
  return JSON.stringify(payloadOf(a)) === JSON.stringify(payloadOf(b));
}

function cloneDoc(doc: ChoreographyDocument): ChoreographyDocument {
  return structuredClone(doc);
}

export function Editor({ initial }: { initial: ChoreographyDocument }) {
  const [doc, setDoc] = useState(initial);
  const [selectedFormationId, setSelectedFormationId] = useState(initial.formations[0]?.id ?? "");
  const [selectedDancerIds, setSelectedDancerIds] = useState<string[]>(() => (initial.dancers[0] ? [initial.dancers[0].id] : []));
  const selectedDancerIdsRef = useRef(selectedDancerIds);
  selectedDancerIdsRef.current = selectedDancerIds;
  const [newName, setNewName] = useState("");
  const [nameEditId, setNameEditId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [preview, setPreview] = useState(false);
  const [faceView, setFaceView] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const beatRef = useRef(0);
  beatRef.current = beat;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [musicError, setMusicError] = useState("");
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicVersion, setMusicVersion] = useState(0);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [shapeOpen, setShapeOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState("");
  const [shape, setShape] = useState<StageShape>(initial.stageShape);
  const [width, setWidth] = useState(initial.stageWidth);
  const [depth, setDepth] = useState(initial.stageDepth);
  const saved = useRef(JSON.stringify(payloadOf(initial)));
  const saveRequest = useRef(0);
  const docRef = useRef(doc);
  docRef.current = doc;
  const pastRef = useRef<ChoreographyDocument[]>([]);
  const futureRef = useRef<ChoreographyDocument[]>([]);
  const gestureBaseRef = useRef<ChoreographyDocument | null>(null);
  const [historyMark, setHistoryMark] = useState(0);
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  const canEdit = doc.role !== "viewer";
  const editing = canEdit && !preview && !faceView;
  const stage = stageOf(doc);
  const singleDimension = shape === "square" || shape === "circle";
  const timeline = useMemo(() => buildTimeline(doc.formations), [doc.formations]);
  const selectedFormation =
    doc.formations.find((formation) => formation.id === selectedFormationId) ?? doc.formations[0];
  const soleDancerId = selectedDancerIds.length === 1 ? selectedDancerIds[0] : undefined;
  const selectedDancer = soleDancerId ? doc.dancers.find((dancer) => dancer.id === soleDancerId) : undefined;

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
    if (!playing) {
      audioRef.current?.pause();
      return;
    }
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const currentAudio = audioRef.current;
      const duration = currentAudio && Number.isFinite(currentAudio.duration) ? currentAudio.duration : null;
      const musicDrives = Boolean(
        doc.musicName &&
          currentAudio &&
          currentAudio.readyState >= 2 &&
          !currentAudio.ended &&
          !currentAudio.paused &&
          (duration === null || currentAudio.currentTime < duration - 0.05),
      );
      if (musicDrives && currentAudio) {
        const next = currentAudio.currentTime * (doc.tempoTpm / 60);
        last = now;
        if (next >= timeline.totalBeats) {
          setBeat(timeline.totalBeats);
          setPlaying(false);
          return;
        }
        setBeat(next);
      } else {
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
      }
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, doc.tempoTpm, doc.musicName, timeline.totalBeats]);

  useEffect(() => {
    if (playing) return;
    const audio = audioRef.current;
    if (!audio || !doc.musicName) return;
    const target = Math.max(0, beat * (60 / doc.tempoTpm));
    const duration = Number.isFinite(audio.duration) ? audio.duration : target;
    const nextTime = Math.min(target, duration);
    if (Math.abs(audio.currentTime - nextTime) <= 0.05) return;
    try {
      audio.currentTime = nextTime;
    } catch {
      // Le navigateur refuse le déplacement tant que le fichier n'est pas prêt.
    }
  }, [playing, beat, doc.musicName, doc.tempoTpm]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!canEdit) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      const meta = event.ctrlKey || event.metaKey;
      if (!meta) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoRef.current();
        return;
      }
      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redoRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit]);

  function bumpHistory() {
    setHistoryMark((mark) => mark + 1);
  }

  function beginGesture() {
    if (!canEdit || gestureBaseRef.current) return;
    gestureBaseRef.current = cloneDoc(docRef.current);
  }

  function commitGesture() {
    const base = gestureBaseRef.current;
    gestureBaseRef.current = null;
    if (!base || samePayload(base, docRef.current)) return;
    pastRef.current.push(base);
    futureRef.current = [];
    bumpHistory();
  }

  function reviseDoc(recipe: (current: ChoreographyDocument) => ChoreographyDocument) {
    if (!canEdit) return;
    if (!gestureBaseRef.current) gestureBaseRef.current = cloneDoc(docRef.current);
    const next = recipe(docRef.current);
    docRef.current = next;
    setDoc(next);
  }

  function editDoc(recipe: (current: ChoreographyDocument) => ChoreographyDocument) {
    if (!canEdit) return;
    commitGesture();
    const current = docRef.current;
    const next = recipe(current);
    if (samePayload(current, next)) return;
    pastRef.current.push(cloneDoc(current));
    futureRef.current = [];
    docRef.current = next;
    setDoc(next);
    bumpHistory();
  }

  function showDocument(next: ChoreographyDocument) {
    const merged = { ...next, musicName: docRef.current.musicName };
    docRef.current = merged;
    setDoc(merged);
    setShape(next.stageShape);
    setWidth(next.stageWidth);
    setDepth(next.stageDepth);
    setPlaying(false);
    setPreview(false);
    setFaceView(false);
    setSelectedFormationId((id) => (next.formations.some((formation) => formation.id === id) ? id : (next.formations[0]?.id ?? "")));
    setSelectedDancerIds((ids) => {
      const kept = ids.filter((id) => next.dancers.some((dancer) => dancer.id === id));
      selectedDancerIdsRef.current = kept;
      return kept;
    });
    setNameEditId((id) => (id && next.dancers.some((dancer) => dancer.id === id) ? id : null));
  }

  function undo() {
    if (!canEdit) return;
    commitGesture();
    const previous = pastRef.current.pop();
    if (!previous) return;
    futureRef.current.push(cloneDoc(docRef.current));
    showDocument(previous);
    bumpHistory();
  }

  function redo() {
    if (!canEdit) return;
    commitGesture();
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(cloneDoc(docRef.current));
    showDocument(next);
    bumpHistory();
  }

  undoRef.current = undo;
  redoRef.current = redo;

  function moveDancer(dancerId: string, point: { x: number; y: number }) {
    if (!selectedFormation || !editing) return;
    const formationId = selectedFormation.id;
    const selected = selectedDancerIdsRef.current;
    const group = selected.includes(dancerId) && selected.length > 1 ? selected : [dancerId];
    reviseDoc((current) => {
      const formation = current.formations.find((item) => item.id === formationId);
      if (!formation) return current;
      const origin = formation.positions.find((position) => position.dancerId === dancerId);
      if (!origin) return current;
      const stageNow = stageOf(current);
      let positions = formation.positions;
      if (group.length === 1) {
        const rounded = roundPoint(clampToValid(point, stageNow));
        positions = formation.positions.map((position) =>
          position.dancerId === dancerId ? { ...position, x: rounded.x, y: rounded.y } : position,
        );
      } else {
        const origins = group.flatMap((id) => {
          const position = formation.positions.find((item) => item.dancerId === id);
          return position ? [{ x: position.x, y: position.y }] : [];
        });
        const delta = groupDelta(origins, { x: point.x - origin.x, y: point.y - origin.y }, stageNow);
        const targets = new Set(group);
        positions = formation.positions.map((position) => {
          if (!targets.has(position.dancerId)) return position;
          const moved = roundPoint({ x: position.x + delta.x, y: position.y + delta.y });
          return { ...position, x: moved.x, y: moved.y };
        });
      }
      return {
        ...current,
        formations: current.formations.map((item) => (item.id === formationId ? { ...item, positions } : item)),
      };
    });
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
    editDoc((current) => {
      const point = wingWaitingPoint(current.dancers.length, stageOf(current));
      return {
        ...current,
        dancers: [...current.dancers, { ...dancer, order: current.dancers.length }],
        formations: current.formations.map((formation) => ({
          ...formation,
          positions: [...formation.positions, { dancerId: dancer.id, x: point.x, y: point.y, curve: 0 }],
        })),
      };
    });
    const nextSelection = [dancer.id];
    selectedDancerIdsRef.current = nextSelection;
    setSelectedDancerIds(nextSelection);
    setNewName("");
  }

  function beginNameEdit(dancer: Dancer) {
    if (!editing) return;
    setNameEditId(dancer.id);
    setNameDraft(dancer.name);
  }

  function cancelNameEdit() {
    setNameEditId(null);
    setNameDraft("");
  }

  function commitNameEdit() {
    const name = nameDraft.trim().replace(/\s+/g, " ");
    const dancerId = nameEditId;
    if (!dancerId || name.length < 1 || name.length > 40) return;
    editDoc((current) => ({
      ...current,
      dancers: current.dancers.map((dancer) => (dancer.id === dancerId ? { ...dancer, name } : dancer)),
    }));
    cancelNameEdit();
  }

  function addFormation(copyId?: string) {
    if (!editing) return;
    const createdId = crypto.randomUUID();
    editDoc((current) => {
      const source = current.formations.find((formation) => formation.id === (copyId ?? selectedFormation?.id)) ?? current.formations[0];
      if (!source) return current;
      const created: Formation = {
        id: createdId,
        order: source.order + 0.5,
        label: "",
        holdBeats: source.holdBeats,
        transitionBeats: source.transitionBeats,
        positions: source.positions.map((position) => ({ ...position, curve: position.curve ?? 0 })),
      };
      return { ...current, formations: relabel([...current.formations, created]) };
    });
    setSelectedFormationId(createdId);
    setPreview(false);
    setPlaying(false);
  }

  function deleteFormation(id: string) {
    if (!editing || doc.formations.length <= 1) return;
    editDoc((current) => {
      if (current.formations.length <= 1) return current;
      return { ...current, formations: relabel(current.formations.filter((formation) => formation.id !== id)) };
    });
    if (selectedFormationId === id) {
      const remaining = docRef.current.formations;
      setSelectedFormationId(remaining.find((formation) => formation.id !== id)?.id ?? remaining[0]?.id ?? "");
    }
  }

  function moveFormation(id: string, direction: -1 | 1) {
    if (!editing) return;
    editDoc((current) => {
      const ordered = current.formations.slice().sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((formation) => formation.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ordered.length) return current;
      const next = ordered.slice();
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return { ...current, formations: relabel(next.map((formation, order) => ({ ...formation, order }))) };
    });
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
    editDoc((current) => {
      const from = stageOf(current);
      return {
        ...current,
        stageShape: next.shape,
        stageWidth: next.width,
        stageDepth: next.depth,
        formations: current.formations.map((formation) => ({
          ...formation,
          positions: formation.positions.map((position) => {
            const moved = roundPoint(migratePosition(position, from, next));
            return { ...position, x: moved.x, y: moved.y };
          }),
        })),
      };
    });
    setWidth(next.width);
    setDepth(next.depth);
  }

  function play() {
    setPreview(true);
    const atEnd = beatRef.current >= timeline.totalBeats - 0.001;
    const start = atEnd ? 0 : beatRef.current;
    if (atEnd) setBeat(start);
    const audio = audioRef.current;
    if (audio && doc.musicName) {
      const target = Math.max(0, start * (60 / doc.tempoTpm));
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
      const nextTime = duration === null ? target : Math.min(target, Math.max(0, duration - 0.05));
      try {
        if (Math.abs(audio.currentTime - nextTime) > 0.05) audio.currentTime = nextTime;
      } catch {
        // Le navigateur refuse le déplacement tant que le fichier n'est pas prêt.
      }
      void audio.play().catch(() => {
        setMusicError("La musique n'a pas pu être lue.");
      });
    }
    setPlaying(true);
  }

  function stopPlayback() {
    setPlaying(false);
    setPreview(false);
    setBeat(0);
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Le fichier n'est pas encore chargé.
    }
  }

  function rememberMusic(musicName: string | null) {
    const next = { ...docRef.current, musicName };
    docRef.current = next;
    setDoc(next);
  }

  async function chooseMusic(file: File) {
    if (!canEdit) return;
    setMusicBusy(true);
    setMusicError("");
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(`/api/choregraphies/${doc.id}/musique`, { method: "POST", body });
    const data = (await response.json().catch(() => null)) as { error?: string; musicName?: string } | null;
    setMusicBusy(false);
    if (!response.ok || !data?.musicName) {
      setMusicError(data?.error ?? "Envoi impossible.");
      return;
    }
    rememberMusic(data.musicName);
    setMusicVersion((version) => version + 1);
  }

  async function removeMusic() {
    if (!canEdit || !doc.musicName) return;
    setMusicBusy(true);
    setMusicError("");
    stopPlayback();
    const response = await fetch(`/api/choregraphies/${doc.id}/musique`, { method: "DELETE" });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setMusicBusy(false);
    if (!response.ok) {
      setMusicError(data?.error ?? "Retrait impossible.");
      return;
    }
    rememberMusic(null);
  }

  function replaceSelection(next: string[]) {
    selectedDancerIdsRef.current = next;
    setSelectedDancerIds(next);
  }

  function toggleDancer(dancerId: string) {
    const current = selectedDancerIdsRef.current;
    replaceSelection(current.includes(dancerId) ? current.filter((id) => id !== dancerId) : [...current, dancerId]);
  }

  function selectFromStage(dancerId: string) {
    const current = selectedDancerIdsRef.current;
    if (!current.includes(dancerId)) replaceSelection([dancerId]);
  }

  function deleteDancer(dancerId: string) {
    if (!editing || doc.dancers.length <= 1) return;
    if (nameEditId === dancerId) cancelNameEdit();
    editDoc((current) => {
      if (current.dancers.length <= 1) return current;
      return {
        ...current,
        dancers: current.dancers
          .filter((dancer) => dancer.id !== dancerId)
          .map((dancer, order) => ({ ...dancer, order })),
        formations: current.formations.map((formation) => ({
          ...formation,
          positions: formation.positions.filter((position) => position.dancerId !== dancerId),
        })),
      };
    });
    replaceSelection(selectedDancerIdsRef.current.filter((id) => id !== dancerId));
  }

  function writeCurve(curve: number, record: (recipe: (current: ChoreographyDocument) => ChoreographyDocument) => void) {
    if (!editing || !selectedFormation || selectedDancerIdsRef.current.length === 0) return;
    const formationId = selectedFormation.id;
    const next = Math.round(Math.max(-MAX_CURVE, Math.min(MAX_CURVE, curve)) * 10) / 10;
    const targets = new Set(selectedDancerIdsRef.current);
    record((current) => ({
      ...current,
      formations: current.formations.map((formation) =>
        formation.id === formationId
          ? {
              ...formation,
              positions: formation.positions.map((position) =>
                targets.has(position.dancerId) ? { ...position, curve: next } : position,
              ),
            }
          : formation,
      ),
    }));
  }

  async function exportPdf() {
    if (exporting) return;
    setExporting(true);
    setSaveError("");
    try {
      const { downloadTableauxPdf } = await import("@/lib/tableauxPdf");
      await downloadTableauxPdf(doc);
    } catch {
      setSaveError("Le PDF n’a pas pu être créé.");
      setStatus("error");
    } finally {
      setExporting(false);
    }
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
  const canUndo = canEdit && historyMark >= 0 && pastRef.current.length > 0;
  const canRedo = canEdit && historyMark >= 0 && futureRef.current.length > 0;
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
  const curveTargets = doc.dancers.filter((dancer) => selectedDancerIds.includes(dancer.id));
  const targetCurves = curveTargets.map(
    (dancer) => selectedFormation?.positions.find((position) => position.dancerId === dancer.id)?.curve ?? 0,
  );
  const sharedCurve = targetCurves.length > 0 && targetCurves.every((value) => value === targetCurves[0]) ? targetCurves[0] : null;
  const shownCurve = sharedCurve ?? targetCurves[0] ?? 0;

  return (
    <div className="flex h-[calc(100dvh-4rem)] w-full min-w-0 flex-col">
      {doc.musicName ? (
        <audio
          key={`${doc.musicName}-${musicVersion}`}
          ref={audioRef}
          preload="auto"
          src={`/api/choregraphies/${doc.id}/musique?v=${musicVersion}`}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-paper-2 px-4 py-3">
        <Link href="/choregraphies" className="text-sm text-muted hover:text-ink">
          Retour
        </Link>
        <input
          value={doc.title}
          disabled={!editing}
          onFocus={beginGesture}
          onBlur={commitGesture}
          onChange={(event) => {
            const title = event.target.value;
            reviseDoc((current) => ({ ...current, title }));
          }}
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
            onFocus={beginGesture}
            onBlur={commitGesture}
            onChange={(event) => {
              const tempo = Number(event.target.value);
              if (Number.isInteger(tempo) && tempo >= 40 && tempo <= 240) {
                reviseDoc((current) => ({ ...current, tempoTpm: tempo }));
              }
            }}
            className="field w-24"
          />
        </label>
        <button type="button" className="btn-ghost" onClick={() => setShapeOpen(true)}>
          forme de la pièce
        </button>
        <button type="button" className="btn-ghost" disabled={exporting} onClick={() => void exportPdf()}>
          {exporting ? "Création du PDF…" : "Exporter le PDF"}
        </button>
        <span className="text-xs text-muted">{ROLE_LABELS[doc.role]}</span>
        <span className={`text-xs ${status === "error" ? "text-curtain" : "text-muted"}`}>{canEdit ? statusLabel : "Lecture seule"}</span>
        <button
          type="button"
          className="btn-ghost h-10 w-10 shrink-0 px-0 leading-none"
          style={{ color: "#000", opacity: 1, fontSize: "1.5rem", lineHeight: 1 }}
          title="Annuler (Ctrl+Z)"
          aria-label="Annuler"
          disabled={!canUndo}
          onClick={undo}
        >
          <span aria-hidden="true">↶</span>
        </button>
        <button
          type="button"
          className="btn-ghost h-10 w-10 shrink-0 px-0 leading-none"
          style={{ color: "#000", opacity: 1, fontSize: "1.5rem", lineHeight: 1 }}
          title="Rétablir (Ctrl+Y)"
          aria-label="Rétablir"
          disabled={!canRedo}
          onClick={redo}
        >
          <span aria-hidden="true">↷</span>
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="max-w-48 truncate text-sm text-muted" title={doc.musicName ?? undefined}>
            {doc.musicName ?? "Aucune musique"}
          </span>
          {canEdit ? (
            <>
              <label className={`btn-ghost cursor-pointer ${musicBusy ? "pointer-events-none opacity-50" : ""}`}>
                Choisir une musique
                <input
                  type="file"
                  accept=".mp3,.wav,.ogg,.m4a,audio/mpeg,audio/wav,audio/ogg,audio/mp4"
                  className="sr-only"
                  disabled={musicBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void chooseMusic(file);
                  }}
                />
              </label>
              {doc.musicName ? (
                <button type="button" className="btn-ghost" disabled={musicBusy} onClick={() => void removeMusic()}>
                  Retirer
                </button>
              ) : null}
            </>
          ) : null}
          {doc.role === "owner" ? (
            <button type="button" className="btn-ghost" onClick={() => setInvitesOpen(true)}>
              Inviter
            </button>
          ) : null}
          <button type="button" className="btn-ghost" onClick={() => setFaceView((current) => !current)}>
            {faceView ? "Plan" : "Vue spectateur"}
          </button>
        </div>
      </div>
      {saveError ? <p className="bg-paper px-4 py-2 text-sm text-curtain">{saveError}</p> : null}
      {musicError ? <p className="bg-paper px-4 py-2 text-sm text-curtain">{musicError}</p> : null}
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
              selectedIds={selectedDancerIds}
              editable={editing}
              travels={travels}
              onSelect={selectFromStage}
              onMove={moveDancer}
              onCurve={(_dancerId, curve) => writeCurve(curve, reviseDoc)}
              onGestureStart={beginGesture}
              onGestureEnd={commitGesture}
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
                      aria-pressed={selectedDancerIds.includes(dancer.id)}
                      onClick={() => toggleDancer(dancer.id)}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-2 py-2 text-left ${
                        selectedDancerIds.includes(dancer.id) ? "border-curtain bg-paper" : "border-line"
                      }`}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: dancer.color }} />
                      <span className="truncate text-sm">{dancer.name}</span>
                    </button>
                    {editing ? (
                      <>
                        <button
                          type="button"
                          className="btn-ghost h-10 w-10 shrink-0 px-0"
                          aria-label={`Modifier le nom de ${dancer.name}`}
                          onClick={() => beginNameEdit(dancer)}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost h-10 w-10 shrink-0 px-0"
                          aria-label={`Supprimer ${dancer.name}`}
                          disabled={doc.dancers.length <= 1}
                          onClick={() => deleteDancer(dancer.id)}
                        >
                          <TrashIcon />
                        </button>
                      </>
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
                    onFocus={beginGesture}
                    onBlur={commitGesture}
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
                    onFocus={beginGesture}
                    onBlur={commitGesture}
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
          ) : selectedDancerIds.length > 1 ? (
            <p className="mt-4 text-sm text-muted">
              Plusieurs danseurs sont sélectionnés. Déplacez-les ensemble sur la scène.
              {selectedFormation && selectedFormation.order < doc.formations.length - 1
                ? " La courbure se modifie pour tout le groupe."
                : ""}
            </p>
          ) : null}
          {selectedFormation && selectedFormation.order < doc.formations.length - 1 && selectedDancerIds.length > 0 ? (
            <div className="mt-4 grid gap-1 text-sm">
              <span className="font-semibold">Courbure (m)</span>
              {curveTargets.length === 0 ? (
                <p className="text-sm text-muted">Choisissez les danseurs concernés.</p>
              ) : targetCurves.every((value) => value === 0) && !editing ? (
                <p className="text-sm text-muted">Ligne droite</p>
              ) : targetCurves.every((value) => value === 0) ? (
                <button type="button" className="btn-ghost justify-self-start" onClick={() => writeCurve(2, editDoc)}>
                  Ajouter une courbe
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="range"
                    min={-MAX_CURVE}
                    max={MAX_CURVE}
                    step={0.1}
                    disabled={!editing}
                    value={shownCurve}
                    aria-label="Courbure du déplacement"
                    className="w-36"
                    onPointerDown={(event) => {
                      beginGesture();
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerUp={commitGesture}
                    onPointerCancel={commitGesture}
                    onBlur={commitGesture}
                    onChange={(event) => writeCurve(Number(event.target.value), reviseDoc)}
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
                    onFocus={beginGesture}
                    onBlur={commitGesture}
                    onChange={(event) => {
                      const curve = Number(event.target.value);
                      if (Number.isFinite(curve)) writeCurve(curve, reviseDoc);
                    }}
                  />
                  {editing ? (
                    <button type="button" className="btn-ghost" onClick={() => writeCurve(0, editDoc)}>
                      Ligne droite
                    </button>
                  ) : null}
                </div>
              )}
              {sharedCurve === null ? <p className="text-xs text-muted">Ces danseurs n&apos;ont pas la même courbure.</p> : null}
              <p className="text-xs text-muted">
                La valeur s&apos;applique aux danseurs choisis, pour le déplacement vers le tableau suivant. 0 m suit la ligne droite. Le signe choisit le côté.
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
                onFocus={beginGesture}
                onBlur={commitGesture}
                onChange={(event) => {
                  const holdBeats = Number(event.target.value);
                  if (!Number.isInteger(holdBeats) || holdBeats < 1 || holdBeats > 128) return;
                  const formationId = selectedFormation.id;
                  reviseDoc((current) => ({
                    ...current,
                    formations: current.formations.map((formation) =>
                      formation.id === formationId ? { ...formation, holdBeats } : formation,
                    ),
                  }));
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
                onFocus={beginGesture}
                onBlur={commitGesture}
                onChange={(event) => {
                  const transitionBeats = Number(event.target.value);
                  if (!Number.isInteger(transitionBeats) || transitionBeats < 1 || transitionBeats > 128) return;
                  const formationId = selectedFormation.id;
                  reviseDoc((current) => ({
                    ...current,
                    formations: current.formations.map((formation) =>
                      formation.id === formationId ? { ...formation, transitionBeats } : formation,
                    ),
                  }));
                }}
                className="field w-28"
              />
            </label>
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
            <div className="ml-auto grid min-w-48 flex-1 gap-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: "2.5rem", height: "2.5rem", padding: 0 }}
                  aria-label={playing ? "Pause" : "Lecture"}
                  title={playing ? "Pause" : "Lecture"}
                  onClick={() => (playing ? setPlaying(false) : play())}
                >
                  {playing ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ width: "2.5rem", height: "2.5rem", padding: 0 }}
                  aria-label="Stop"
                  title="Stop"
                  onClick={stopPlayback}
                >
                  <StopIcon />
                </button>
              </div>
              <input
                type="range"
                aria-label="Lecture"
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
            </div>
          </div>
        ) : null}
      </div>
      {shapeOpen ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={() => setShapeOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shape-dialog-title"
            className="w-full max-w-md rounded-2xl bg-paper-2 p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="shape-dialog-title" className="font-display text-2xl">
                Forme de la pièce
              </h2>
              <button type="button" className="btn-ghost" onClick={() => setShapeOpen(false)}>
                Fermer
              </button>
            </div>
            <div className="mt-4 grid gap-3">
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
          </div>
        </div>
      ) : null}
      {invitesOpen ? <InvitePanel choreographyId={doc.id} onClose={() => setInvitesOpen(false)} /> : null}
    </div>
  );
}
