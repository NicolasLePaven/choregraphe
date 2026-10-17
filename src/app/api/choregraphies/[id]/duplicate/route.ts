import { NextResponse } from "next/server";
import { loadChoreography, requireApiSession } from "@/lib/access";
import { copyMusic } from "@/lib/music";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

function duplicateTitle(title: string) {
  const suffix = " (copie)";
  if (title.length + suffix.length <= 80) return `${title}${suffix}`;
  const trimmed = title.slice(0, 80 - suffix.length).trimEnd();
  return `${trimmed || "Pièce"}${suffix}`.slice(0, 80);
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;
  const { id } = await context.params;
  const loaded = await loadChoreography(id, auth.session.userId);
  if (!loaded) return NextResponse.json({ error: "Chorégraphie introuvable." }, { status: 404 });

  const source = loaded.choreography;
  const dancers = source.dancers.slice().sort((a, b) => a.order - b.order);
  const formations = source.formations.slice().sort((a, b) => a.order - b.order);
  if (dancers.length < 1 || formations.length < 1) {
    return NextResponse.json({ error: "Cette chorégraphie ne peut pas être dupliquée." }, { status: 400 });
  }

  const ownerId = auth.session.userId;
  const dancerIds = new Map(dancers.map((dancer) => [dancer.id, crypto.randomUUID()]));
  const created = await prisma.$transaction(async (tx) => {
    const choreography = await tx.choreography.create({
      data: {
        ownerId,
        title: duplicateTitle(source.title),
        stageShape: source.stageShape,
        stageWidth: source.stageWidth,
        stageDepth: source.stageDepth,
        tempoTpm: source.tempoTpm,
      },
    });
    await tx.dancer.createMany({
      data: dancers.map((dancer, order) => ({
        id: dancerIds.get(dancer.id) ?? crypto.randomUUID(),
        choreographyId: choreography.id,
        name: dancer.name,
        color: dancer.color,
        order,
      })),
    });
    for (const [index, formation] of formations.entries()) {
      const copy = await tx.formation.create({
        data: {
          choreographyId: choreography.id,
          order: index,
          label: formation.label,
          holdBeats: formation.holdBeats,
          transitionBeats: formation.transitionBeats,
        },
      });
      await tx.position.createMany({
        data: formation.positions.flatMap((position) => {
          const dancerId = dancerIds.get(position.dancerId);
          if (!dancerId) return [];
          return [{ formationId: copy.id, dancerId, x: position.x, y: position.y, curve: position.curve }];
        }),
      });
    }
    return choreography;
  });

  if (source.musicFile && source.musicName) {
    const musicFile = await copyMusic(source.musicFile, created.id);
    if (musicFile) {
      await prisma.choreography.update({
        where: { id: created.id },
        data: { musicFile, musicName: source.musicName },
      });
    }
  }

  return NextResponse.json({ id: created.id });
}
