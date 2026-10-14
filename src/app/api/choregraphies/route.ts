import { NextResponse } from "next/server";
import { listChoreographies, requireApiSession } from "@/lib/access";
import { nextColor } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { createFormationPositions, parseCreateInput } from "@/lib/validate";

export async function GET() {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;
  const items = await listChoreographies(auth.session.userId);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;

  const parsed = parseCreateInput(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const points = createFormationPositions(parsed.names, parsed.stage);
  const used: string[] = [];
  const dancers = parsed.names.map((name, index) => {
    const color = nextColor(used);
    used.push(color);
    return { id: crypto.randomUUID(), name, color, order: index };
  });

  const created = await prisma.$transaction(async (tx) => {
    const choreography = await tx.choreography.create({
      data: {
        ownerId: auth.session.userId,
        title: parsed.title,
        stageShape: parsed.stage.shape,
        stageWidth: parsed.stage.width,
        stageDepth: parsed.stage.depth,
        tempoTpm: parsed.tempoTpm,
      },
    });
    await tx.dancer.createMany({
      data: dancers.map((dancer) => ({ ...dancer, choreographyId: choreography.id })),
    });
    const formation = await tx.formation.create({
      data: {
        choreographyId: choreography.id,
        order: 0,
        label: "Tableau 1",
        holdBeats: 8,
        transitionBeats: 4,
      },
    });
    await tx.position.createMany({
      data: dancers.map((dancer, index) => ({
        formationId: formation.id,
        dancerId: dancer.id,
        x: points[index].x,
        y: points[index].y,
      })),
    });
    return choreography;
  });

  return NextResponse.json({ id: created.id });
}
