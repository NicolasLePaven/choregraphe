import { NextResponse } from "next/server";
import type { Choreography, Dancer, Formation, Position } from "@prisma/client";
import { getSession, type Session } from "./auth";
import type { ChoreographyDocument, ChoreographySummary, Role } from "./domain";
import { isStageShape } from "./geometry";
import { prisma } from "./prisma";

export async function requireApiSession(): Promise<
  { session: Session; response: null } | { session: null; response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { session: null, response: NextResponse.json({ error: "Connexion requise." }, { status: 401 }) };
  }
  return { session, response: null };
}

type FormationWithPositions = Formation & { positions: Position[] };

function isShareRole(role: string): role is "editor" | "viewer" {
  return role === "editor" || role === "viewer";
}

export function toDocument(
  choreography: Choreography & { dancers: Dancer[]; formations: FormationWithPositions[] },
  role: Role,
): ChoreographyDocument {
  const shape = isStageShape(choreography.stageShape) ? choreography.stageShape : "rectangle";
  return {
    id: choreography.id,
    title: choreography.title,
    stageShape: shape,
    stageWidth: choreography.stageWidth,
    stageDepth: choreography.stageDepth,
    tempoTpm: choreography.tempoTpm,
    musicName: choreography.musicName,
    role,
    updatedAt: choreography.updatedAt.toISOString(),
    dancers: choreography.dancers
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((dancer) => ({
        id: dancer.id,
        name: dancer.name,
        color: dancer.color,
        order: dancer.order,
      })),
    formations: choreography.formations
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((formation) => ({
        id: formation.id,
        order: formation.order,
        label: formation.label,
        holdBeats: formation.holdBeats,
        transitionBeats: formation.transitionBeats,
        positions: formation.positions.map((position) => ({
          dancerId: position.dancerId,
          x: position.x,
          y: position.y,
          curve: position.curve ?? 0,
        })),
      })),
  };
}

export async function listChoreographies(userId: string): Promise<ChoreographySummary[]> {
  const [owned, shared] = await Promise.all([
    prisma.choreography.findMany({
      where: { ownerId: userId },
      include: { _count: { select: { dancers: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.membership.findMany({
      where: { userId },
      include: { choreography: { include: { _count: { select: { dancers: true } } } } },
    }),
  ]);

  return [
    ...owned.map((item) => toSummary(item, item._count.dancers, "owner")),
    ...shared
      .filter((item): item is typeof item & { role: "editor" | "viewer" } => isShareRole(item.role))
      .map((item) => toSummary(item.choreography, item.choreography._count.dancers, item.role)),
  ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function toSummary(
  item: { id: string; title: string; stageShape: string; tempoTpm: number; updatedAt: Date },
  dancerCount: number,
  role: Role,
): ChoreographySummary {
  return {
    id: item.id,
    title: item.title,
    stageShape: isStageShape(item.stageShape) ? item.stageShape : "rectangle",
    tempoTpm: item.tempoTpm,
    dancerCount,
    role,
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function loadChoreography(id: string, userId: string) {
  const choreography = await prisma.choreography.findUnique({
    where: { id },
    include: {
      dancers: true,
      formations: { include: { positions: true } },
    },
  });
  if (!choreography) return null;
  if (choreography.ownerId === userId) return { role: "owner" as const, choreography };
  const membership = await prisma.membership.findFirst({
    where: { choreographyId: id, userId },
  });
  if (!membership || !isShareRole(membership.role)) return null;
  return { role: membership.role, choreography };
}
