import type { Point, Stage, StageShape } from "./geometry";

export type Role = "owner" | "editor" | "viewer";

export type Dancer = {
  id: string;
  name: string;
  color: string;
  order: number;
};

export type FormationPosition = {
  dancerId: string;
  x: number;
  y: number;
  curve: number;
};

export type Formation = {
  id: string;
  order: number;
  label: string;
  holdBeats: number;
  transitionBeats: number;
  positions: FormationPosition[];
};

/** Décalage maximal, en mètres, du milieu du trajet par rapport à la ligne droite. */
export const MAX_CURVE = 20;

export type ChoreographyDocument = {
  id: string;
  title: string;
  stageShape: StageShape;
  stageWidth: number;
  stageDepth: number;
  tempoTpm: number;
  musicName: string | null;
  role: Role;
  dancers: Dancer[];
  formations: Formation[];
  updatedAt: string;
};

export type ChoreographySummary = {
  id: string;
  title: string;
  stageShape: StageShape;
  tempoTpm: number;
  dancerCount: number;
  role: Role;
  updatedAt: string;
};

export type MemberRecord = {
  id: string;
  email: string;
  role: "editor" | "viewer";
  pending: boolean;
  name: string | null;
};

export const DANCER_COLORS = [
  "#e85d4c",
  "#3d7ea6",
  "#e0a106",
  "#3f8f5b",
  "#8d5aa8",
  "#d06a2b",
  "#1f8a7a",
  "#c43d66",
  "#4d6ec4",
  "#8a7b32",
  "#d37ba0",
  "#5c8f3a",
  "#b85c38",
  "#3e8ea8",
  "#a35d2d",
  "#6d7a32",
  "#c46b4a",
  "#2f6f8f",
  "#9a4d6a",
  "#4f8f6a",
  "#c48a2a",
  "#5a5eab",
  "#8f4e3a",
  "#3d8f78",
  "#b34d4d",
  "#6a8f2f",
  "#7a5c3a",
  "#3a6e9a",
  "#a86a3a",
  "#4a7a4a",
];

export const SHAPE_LABELS: Record<StageShape, string> = {
  rectangle: "Rectangulaire",
  square: "Carrée",
  oval: "Ovale",
  circle: "Circulaire",
  semicircle: "Demi-cercle",
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Créateur",
  editor: "Édition",
  viewer: "Lecture seule",
};

export function initials(name: string) {
  const letters = Array.from(name.normalize("NFC")).filter((char) => /\p{L}/u.test(char));
  const text = letters.slice(0, 2).join("");
  return text ? text.toLocaleUpperCase("fr-FR") : "?";
}

export function nextColor(used: string[]) {
  return DANCER_COLORS.find((color) => !used.includes(color)) ?? DANCER_COLORS[used.length % DANCER_COLORS.length];
}

export function stageOf(doc: { stageShape: StageShape; stageWidth: number; stageDepth: number }): Stage {
  return { shape: doc.stageShape, width: doc.stageWidth, depth: doc.stageDepth };
}

export function relabel(formations: Formation[]): Formation[] {
  return formations
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((formation, index) => ({
      ...formation,
      order: index,
      label: `Tableau ${index + 1}`,
    }));
}

export type TimelineSegment = {
  formationIndex: number;
  phase: "hold" | "move";
  startBeat: number;
  beats: number;
};

function byOrder<T extends { order: number }>(items: T[]) {
  return items.slice().sort((a, b) => a.order - b.order);
}

export function buildTimeline(formations: Pick<Formation, "order" | "holdBeats" | "transitionBeats">[]) {
  const segments: TimelineSegment[] = [];
  let beat = 0;
  byOrder(formations).forEach((formation, index) => {
    segments.push({
      formationIndex: index,
      phase: "hold",
      startBeat: beat,
      beats: formation.holdBeats,
    });
    beat += formation.holdBeats;
    if (index < formations.length - 1) {
      segments.push({
        formationIndex: index,
        phase: "move",
        startBeat: beat,
        beats: formation.transitionBeats,
      });
      beat += formation.transitionBeats;
    }
  });
  return { totalBeats: beat, segments };
}

function positionMap(formation: Formation) {
  const map = new Map<string, Point & { curve: number }>();
  for (const position of formation.positions) {
    map.set(position.dancerId, { x: position.x, y: position.y, curve: position.curve ?? 0 });
  }
  return map;
}

function controlPoint(from: Point, to: Point, curve: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  if (length < 1e-6) return mid;
  return {
    x: mid.x + (-dy / length) * curve * 2,
    y: mid.y + (dx / length) * curve * 2,
  };
}

export function pointOnCurve(from: Point, to: Point, curve: number, progress: number): Point {
  if (Math.abs(curve) < 1e-6) {
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
  }
  const control = controlPoint(from, to, curve);
  const rest = 1 - progress;
  return {
    x: rest * rest * from.x + 2 * rest * progress * control.x + progress * progress * to.x,
    y: rest * rest * from.y + 2 * rest * progress * control.y + progress * progress * to.y,
  };
}

export function curveSamples(from: Point, to: Point, curve: number, steps = 28): Point[] {
  const points: Point[] = [];
  for (let index = 0; index <= steps; index += 1) points.push(pointOnCurve(from, to, curve, index / steps));
  return points;
}

export function curveFromPointer(from: Point, to: Point, pointer: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return 0;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const signed = ((pointer.x - midX) * -dy + (pointer.y - midY) * dx) / length;
  const clamped = Math.max(-MAX_CURVE, Math.min(MAX_CURVE, signed));
  return Math.round(clamped * 10) / 10;
}

export function segmentAt(beat: number, formations: Formation[]) {
  const ordered = byOrder(formations);
  const timeline = buildTimeline(ordered);
  if (timeline.segments.length === 0) return null;
  const t = Math.min(Math.max(beat, 0), timeline.totalBeats);
  if (t >= timeline.totalBeats) return timeline.segments[timeline.segments.length - 1];
  return (
    timeline.segments.find((segment) => t >= segment.startBeat && t < segment.startBeat + segment.beats) ??
    timeline.segments[timeline.segments.length - 1]
  );
}

export function samplePositions(beat: number, formations: Formation[], dancers: Dancer[]) {
  const ordered = byOrder(formations);
  const result = new Map<string, Point>();
  if (ordered.length === 0) return result;
  const timeline = buildTimeline(ordered);
  const t = Math.min(Math.max(beat, 0), timeline.totalBeats);
  const segment = segmentAt(t, ordered);
  if (!segment) return result;
  const current = positionMap(ordered[segment.formationIndex]);
  const next =
    segment.phase === "move" && segment.formationIndex < ordered.length - 1
      ? positionMap(ordered[segment.formationIndex + 1])
      : null;
  const progress = next && segment.beats > 0 ? (t - segment.startBeat) / segment.beats : 0;
  for (const dancer of dancers) {
    const from = current.get(dancer.id) ?? { x: 0, y: 0, curve: 0 };
    const to = next?.get(dancer.id) ?? from;
    result.set(dancer.id, next ? pointOnCurve(from, to, from.curve, progress) : { x: from.x, y: from.y });
  }
  return result;
}
