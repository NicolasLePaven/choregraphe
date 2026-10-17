import { NextResponse } from "next/server";
import { loadChoreography, requireApiSession, toDocument } from "@/lib/access";
import { removeMusicFiles } from "@/lib/music";
import { prisma } from "@/lib/prisma";
import { parseDraft } from "@/lib/validate";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;
  const { id } = await context.params;
  const loaded = await loadChoreography(id, auth.session.userId);
  if (!loaded) return NextResponse.json({ error: "Chorégraphie introuvable." }, { status: 404 });
  return NextResponse.json(toDocument(loaded.choreography, loaded.role));
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;
  const { id } = await context.params;
  const loaded = await loadChoreography(id, auth.session.userId);
  if (!loaded) return NextResponse.json({ error: "Chorégraphie introuvable." }, { status: 404 });
  if (loaded.role === "viewer") {
    return NextResponse.json({ error: "Cette chorégraphie est en lecture seule." }, { status: 403 });
  }

  const parsed = parseDraft(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const draft = parsed.draft;
  const dancerIds = draft.dancers.map((dancer) => dancer.id);
  const formationIds = draft.formations.map((formation) => formation.id);

  const [foreignDancers, foreignFormations] = await Promise.all([
    prisma.dancer.findMany({ where: { id: { in: dancerIds }, NOT: { choreographyId: id } }, select: { id: true } }),
    prisma.formation.findMany({
      where: { id: { in: formationIds }, NOT: { choreographyId: id } },
      select: { id: true },
    }),
  ]);
  if (foreignDancers.length > 0 || foreignFormations.length > 0) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.position.deleteMany({ where: { formation: { choreographyId: id } } });
    await tx.formation.deleteMany({ where: { choreographyId: id, id: { notIn: formationIds } } });
    await tx.dancer.deleteMany({ where: { choreographyId: id, id: { notIn: dancerIds } } });
    await tx.choreography.update({
      where: { id },
      data: {
        title: draft.title,
        stageShape: draft.stageShape,
        stageWidth: draft.stageWidth,
        stageDepth: draft.stageDepth,
        tempoTpm: draft.tempoTpm,
      },
    });
    for (const dancer of draft.dancers) {
      await tx.dancer.upsert({
        where: { id: dancer.id },
        create: { ...dancer, choreographyId: id },
        update: { name: dancer.name, color: dancer.color, order: dancer.order },
      });
    }
    for (const formation of draft.formations) {
      await tx.formation.upsert({
        where: { id: formation.id },
        create: {
          id: formation.id,
          choreographyId: id,
          order: formation.order,
          label: formation.label,
          holdBeats: formation.holdBeats,
          transitionBeats: formation.transitionBeats,
        },
        update: {
          order: formation.order,
          label: formation.label,
          holdBeats: formation.holdBeats,
          transitionBeats: formation.transitionBeats,
        },
      });
      await tx.position.createMany({
        data: formation.positions.map((position) => ({
          formationId: formation.id,
          dancerId: position.dancerId,
          x: position.x,
          y: position.y,
          curve: position.curve,
        })),
      });
    }
  });

  const refreshed = await loadChoreography(id, auth.session.userId);
  if (!refreshed) return NextResponse.json({ error: "Chorégraphie introuvable." }, { status: 404 });
  return NextResponse.json(toDocument(refreshed.choreography, refreshed.role));
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;
  const { id } = await context.params;
  const choreography = await prisma.choreography.findUnique({
    where: { id },
    select: { ownerId: true, musicFile: true },
  });
  if (!choreography || choreography.ownerId !== auth.session.userId) {
    return NextResponse.json({ error: "Chorégraphie introuvable." }, { status: 404 });
  }
  await prisma.choreography.delete({ where: { id } });
  if (choreography.musicFile) await removeMusicFiles(id);
  return NextResponse.json({ ok: true });
}
