import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string; memberId: string }> };

async function ownedMembership(id: string, memberId: string, userId: string) {
  const choreography = await prisma.choreography.findUnique({ where: { id }, select: { ownerId: true } });
  if (!choreography || choreography.ownerId !== userId) return null;
  return prisma.membership.findFirst({ where: { id: memberId, choreographyId: id } });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;
  const { id, memberId } = await context.params;
  const membership = await ownedMembership(id, memberId, auth.session.userId);
  if (!membership) return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const role = body?.role === "editor" || body?.role === "viewer" ? body.role : null;
  if (!role) return NextResponse.json({ error: "Droit invalide." }, { status: 400 });

  await prisma.membership.update({ where: { id: membership.id }, data: { role } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;
  const { id, memberId } = await context.params;
  const membership = await ownedMembership(id, memberId, auth.session.userId);
  if (!membership) return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  await prisma.membership.delete({ where: { id: membership.id } });
  return NextResponse.json({ ok: true });
}
