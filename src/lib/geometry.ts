export const WING_WIDTH = 3;
export const MIN_STAGE = 2;
export const MAX_STAGE = 40;

export const STAGE_SHAPES = ["rectangle", "square", "oval", "circle", "semicircle"] as const;
export type StageShape = (typeof STAGE_SHAPES)[number];

export type Stage = {
  shape: StageShape;
  width: number;
  depth: number;
};

export type Point = { x: number; y: number };

export type Zone = "scene" | "coulisse-gauche" | "coulisse-droite" | "dehors";

export function isStageShape(value: string): value is StageShape {
  return (STAGE_SHAPES as readonly string[]).includes(value);
}

export function resolvedStage(stage: Stage): Stage {
  if (stage.shape === "square" || stage.shape === "circle") {
    return { shape: stage.shape, width: stage.width, depth: stage.width };
  }
  if (stage.shape === "semicircle") {
    return { shape: stage.shape, width: stage.width, depth: stage.width / 2 };
  }
  return { shape: stage.shape, width: stage.width, depth: stage.depth };
}

function halves(stage: Stage) {
  const resolved = resolvedStage(stage);
  return {
    ...resolved,
    hx: resolved.width / 2,
    hy: resolved.depth / 2,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function dist2(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function isInsideStage(point: Point, stage: Stage) {
  const { shape, hx, hy } = halves(stage);
  if (hx <= 0 || hy <= 0) return false;
  if (shape === "rectangle" || shape === "square") {
    return Math.abs(point.x) <= hx + 1e-6 && Math.abs(point.y) <= hy + 1e-6;
  }
  if (shape === "semicircle") {
    if (point.y > hy + 1e-6) return false;
    const dy = point.y - hy;
    return point.x * point.x + dy * dy <= hx * hx + 1e-6;
  }
  return (point.x * point.x) / (hx * hx) + (point.y * point.y) / (hy * hy) <= 1 + 1e-6;
}

export function isInLeftWing(point: Point, stage: Stage) {
  const { hx, hy } = halves(stage);
  return (
    point.x >= -hx - WING_WIDTH - 1e-6 &&
    point.x <= -hx + 1e-6 &&
    Math.abs(point.y) <= hy + 1e-6
  );
}

export function isInRightWing(point: Point, stage: Stage) {
  const { hx, hy } = halves(stage);
  return (
    point.x >= hx - 1e-6 &&
    point.x <= hx + WING_WIDTH + 1e-6 &&
    Math.abs(point.y) <= hy + 1e-6
  );
}

export function zoneOf(point: Point, stage: Stage): Zone {
  if (isInsideStage(point, stage)) return "scene";
  if (isInLeftWing(point, stage)) return "coulisse-gauche";
  if (isInRightWing(point, stage)) return "coulisse-droite";
  return "dehors";
}

export function zoneLabel(zone: Zone) {
  switch (zone) {
    case "scene":
      return "Scène";
    case "coulisse-gauche":
      return "Coulisse gauche";
    case "coulisse-droite":
      return "Coulisse droite";
    default:
      return "Hors plateau";
  }
}

function closestOnEllipse(point: Point, hx: number, hy: number): Point {
  if (Math.abs(point.x) < 1e-9 && Math.abs(point.y) < 1e-9) {
    return { x: hx, y: 0 };
  }
  let t = Math.atan2(point.y / hy, point.x / hx);
  for (let i = 0; i < 16; i += 1) {
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const x = hx * cos;
    const y = hy * sin;
    const dx = -hx * sin;
    const dy = hy * cos;
    const ddx = -hx * cos;
    const ddy = -hy * sin;
    const fx = x - point.x;
    const fy = y - point.y;
    const g = fx * dx + fy * dy;
    const gp = dx * dx + dy * dy + fx * ddx + fy * ddy;
    if (Math.abs(gp) < 1e-12) break;
    const step = g / gp;
    if (Math.abs(step) < 1e-10) break;
    t -= step;
  }
  return { x: hx * Math.cos(t), y: hy * Math.sin(t) };
}

function closestOnSemicircle(point: Point, hx: number, hy: number): Point {
  const onDiameter = { x: clamp(point.x, -hx, hx), y: hy };
  const dx = point.x;
  const dy = point.y - hy;
  const len = Math.hypot(dx, dy);
  let angle = len < 1e-9 ? -Math.PI / 2 : Math.atan2(dy, dx);
  if (angle > 0) angle = angle <= Math.PI / 2 ? 0 : -Math.PI;
  const onArc = { x: hx * Math.cos(angle), y: hy + hx * Math.sin(angle) };
  return dist2(point, onArc) <= dist2(point, onDiameter) ? onArc : onDiameter;
}

export function closestOnStage(point: Point, stage: Stage): Point {
  const { shape, hx, hy } = halves(stage);
  if (shape === "rectangle" || shape === "square") {
    return { x: clamp(point.x, -hx, hx), y: clamp(point.y, -hy, hy) };
  }
  if (isInsideStage(point, stage)) return { x: point.x, y: point.y };
  if (shape === "semicircle") return closestOnSemicircle(point, hx, hy);
  return closestOnEllipse(point, hx, hy);
}

function closestInRect(
  point: Point,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): Point {
  return { x: clamp(point.x, minX, maxX), y: clamp(point.y, minY, maxY) };
}

export function clampToValid(point: Point, stage: Stage): Point {
  if (zoneOf(point, stage) !== "dehors") return { x: point.x, y: point.y };
  const { hx, hy } = halves(stage);
  const candidates = [
    closestOnStage(point, stage),
    closestInRect(point, -hx - WING_WIDTH, -hx, -hy, hy),
    closestInRect(point, hx, hx + WING_WIDTH, -hy, hy),
  ];
  return candidates.reduce((best, candidate) =>
    dist2(point, candidate) < dist2(point, best) ? candidate : best,
  );
}

export function migratePosition(point: Point, from: Stage, to: Stage): Point {
  const zone = zoneOf(point, from);
  const { hx, hy } = halves(to);
  if (zone === "coulisse-gauche") {
    return closestInRect(point, -hx - WING_WIDTH, -hx, -hy, hy);
  }
  if (zone === "coulisse-droite") {
    return closestInRect(point, hx, hx + WING_WIDTH, -hy, hy);
  }
  if (isInsideStage(point, to)) return { x: point.x, y: point.y };
  return closestOnStage(point, to);
}

export function roundPoint(point: Point): Point {
  return {
    x: Math.round(point.x * 1000) / 1000,
    y: Math.round(point.y * 1000) / 1000,
  };
}

export function pullInside(point: Point, stage: Stage): Point {
  if (isInsideStage(point, stage)) return point;
  const edge = closestOnStage(point, stage);
  const inside = { x: edge.x * 0.86, y: edge.y * 0.86 };
  return isInsideStage(inside, stage) ? inside : edge;
}

export function initialStagePoints(count: number, stage: Stage): Point[] {
  const { width, depth } = resolvedStage(stage);
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const usableW = width * 0.64;
  const usableH = depth * 0.64;
  const points: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = cols === 1 ? 0 : -usableW / 2 + (col * usableW) / (cols - 1);
    const y = rows === 1 ? 0 : usableH / 2 - (row * usableH) / (rows - 1);
    points.push(roundPoint(pullInside({ x, y }, stage)));
  }
  return points;
}

export const SPECTATOR = { x: 0, y: -15 } as const;
export const DANCER_HEIGHT = 1.7;
export const DANCER_WIDTH = 0.45;
const MIN_VIEW_DISTANCE = 0.25;

export type ApparentFigure = {
  D: number;
  x: number;
  h: number;
  w: number;
};

export function apparentOf(point: Point): ApparentFigure {
  const D = Math.max(Math.hypot(point.x - SPECTATOR.x, point.y - SPECTATOR.y), MIN_VIEW_DISTANCE);
  return {
    D,
    x: (point.x - SPECTATOR.x) / D,
    h: DANCER_HEIGHT / D,
    w: DANCER_WIDTH / D,
  };
}

export function wingWaitingPoint(slot: number, stage: Stage): Point {
  const { hx, hy } = halves(stage);
  const x = -hx - WING_WIDTH / 2;
  const y = hy * 0.72 - (slot % 10) * ((Math.max(hy * 1.44, 0.6)) / 9);
  return roundPoint(clampToValid({ x, y }, stage));
}
