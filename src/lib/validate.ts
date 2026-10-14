import {
  clampToValid,
  initialStagePoints,
  isStageShape,
  MAX_STAGE,
  MIN_STAGE,
  resolvedStage,
  roundPoint,
  type Stage,
  type StageShape,
} from "./geometry";
import { MAX_CURVE, nextColor, type Dancer, type Formation } from "./domain";

export type DraftDocument = {
  title: string;
  stageShape: StageShape;
  stageWidth: number;
  stageDepth: number;
  tempoTpm: number;
  dancers: Dancer[];
  formations: Formation[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function curveValue(value: unknown) {
  if (value === undefined || value === null) return 0;
  const number = finiteNumber(value);
  if (number === null) return null;
  const clamped = Math.max(-MAX_CURVE, Math.min(MAX_CURVE, number));
  return Math.round(clamped * 100) / 100;
}

function integerIn(value: unknown, min: number, max: number) {
  const number = finiteNumber(value);
  if (number === null || !Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

function dimension(value: unknown) {
  const number = finiteNumber(value);
  if (number === null || number < MIN_STAGE || number > MAX_STAGE) return null;
  return Math.round(number * 100) / 100;
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return null;
  return email;
}

export function normalizePersonName(value: unknown, max = 40) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > max) return null;
  return name;
}

export function stageFrom(shape: StageShape, width: number, depth: number): Stage {
  return resolvedStage({ shape, width, depth });
}

export function parseDraft(value: unknown): { draft: DraftDocument } | { error: string } {
  const body = asRecord(value);
  if (!body) return { error: "Données illisibles." };

  const title = normalizePersonName(body.title, 80);
  if (!title) return { error: "Le titre doit contenir entre 1 et 80 caractères." };

  if (typeof body.stageShape !== "string" || !isStageShape(body.stageShape)) {
    return { error: "Forme de scène inconnue." };
  }

  const stageWidth = dimension(body.stageWidth);
  if (stageWidth === null) return { error: "La largeur doit être comprise entre 2 et 40 mètres." };
  const rawDepth = body.stageShape === "square" || body.stageShape === "circle" ? stageWidth : dimension(body.stageDepth);
  if (rawDepth === null) return { error: "La profondeur doit être comprise entre 2 et 40 mètres." };

  const tempoTpm = integerIn(body.tempoTpm, 40, 240);
  if (tempoTpm === null) return { error: "Le TPM doit être un entier entre 40 et 240." };

  if (!Array.isArray(body.dancers) || body.dancers.length < 1 || body.dancers.length > 30) {
    return { error: "Une chorégraphie compte entre 1 et 30 danseurs." };
  }
  if (!Array.isArray(body.formations) || body.formations.length < 1 || body.formations.length > 80) {
    return { error: "Ajoutez au moins un tableau." };
  }

  const stage = stageFrom(body.stageShape, stageWidth, rawDepth);
  const dancers: Dancer[] = [];
  const dancerIds = new Set<string>();

  for (let index = 0; index < body.dancers.length; index += 1) {
    const item = asRecord(body.dancers[index]);
    if (!item || typeof item.id !== "string" || item.id.length < 8 || item.id.length > 80) {
      return { error: "Danseur invalide." };
    }
    if (dancerIds.has(item.id)) return { error: "Danseur en double." };
    const name = normalizePersonName(item.name);
    if (!name) return { error: "Chaque danseur doit avoir un nom." };
    const color = typeof item.color === "string" && /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : nextColor([]);
    dancerIds.add(item.id);
    dancers.push({ id: item.id, name, color, order: index });
  }

  const formations: Formation[] = [];
  for (let index = 0; index < body.formations.length; index += 1) {
    const item = asRecord(body.formations[index]);
    if (!item || typeof item.id !== "string" || item.id.length < 8 || item.id.length > 80) {
      return { error: "Tableau invalide." };
    }
    const holdBeats = integerIn(item.holdBeats, 1, 128);
    const transitionBeats = integerIn(item.transitionBeats, 1, 128);
    if (holdBeats === null || transitionBeats === null) {
      return { error: "La tenue et le déplacement se comptent en temps, de 1 à 128." };
    }
    if (!Array.isArray(item.positions)) return { error: "Positions manquantes." };
    const positions = [];
    const seen = new Set<string>();
    for (const raw of item.positions) {
      const position = asRecord(raw);
      if (!position || typeof position.dancerId !== "string" || !dancerIds.has(position.dancerId)) {
        return { error: "Position rattachée à un danseur inconnu." };
      }
      if (seen.has(position.dancerId)) return { error: "Position en double." };
      const x = finiteNumber(position.x);
      const y = finiteNumber(position.y);
      if (x === null || y === null) return { error: "Coordonnées invalides." };
      seen.add(position.dancerId);
      const curve = curveValue(position.curve);
      if (curve === null) return { error: "Courbure invalide." };
      const clamped = roundPoint(clampToValid({ x, y }, stage));
      positions.push({ dancerId: position.dancerId, x: clamped.x, y: clamped.y, curve });
    }
    if (seen.size !== dancers.length) return { error: "Chaque tableau doit placer tous les danseurs." };
    formations.push({
      id: item.id,
      order: index,
      label: `Tableau ${index + 1}`,
      holdBeats,
      transitionBeats,
      positions,
    });
  }

  return {
    draft: {
      title,
      stageShape: stage.shape,
      stageWidth: stage.width,
      stageDepth: stage.depth,
      tempoTpm,
      dancers,
      formations,
    },
  };
}

export function parseCreateInput(value: unknown):
  | {
      title: string;
      stage: Stage;
      tempoTpm: number;
      names: string[];
    }
  | { error: string } {
  const body = asRecord(value);
  if (!body) return { error: "Données illisibles." };
  const title = normalizePersonName(body.title, 80);
  if (!title) return { error: "Le titre doit contenir entre 1 et 80 caractères." };
  if (typeof body.stageShape !== "string" || !isStageShape(body.stageShape)) {
    return { error: "Forme de scène inconnue." };
  }
  const stageWidth = dimension(body.stageWidth);
  if (stageWidth === null) return { error: "La largeur doit être comprise entre 2 et 40 mètres." };
  const stageDepth =
    body.stageShape === "square" || body.stageShape === "circle" ? stageWidth : dimension(body.stageDepth);
  if (stageDepth === null) return { error: "La profondeur doit être comprise entre 2 et 40 mètres." };
  const tempoTpm = integerIn(body.tempoTpm, 40, 240);
  if (tempoTpm === null) return { error: "Le TPM doit être un entier entre 40 et 240." };
  if (!Array.isArray(body.dancers) || body.dancers.length < 1 || body.dancers.length > 30) {
    return { error: "Indiquez entre 1 et 30 danseurs." };
  }
  const names: string[] = [];
  for (const item of body.dancers) {
    const record = asRecord(item);
    const name = normalizePersonName(record?.name);
    if (!name) return { error: "Chaque danseur doit avoir un nom." };
    names.push(name);
  }
  return { title, stage: stageFrom(body.stageShape, stageWidth, stageDepth), tempoTpm, names };
}

export function createFormationPositions(names: string[], stage: Stage) {
  return initialStagePoints(names.length, stage);
}
