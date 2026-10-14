import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/validate";

type RouteContext = { params: Promise<{ id: string }> };

async function ownerChoreography(id: string, userId: string) {
  const choreography = await prisma.choreography.findUnique({
    where: { id },
    include: { owner: { select: { email: true } } },
  });
  if (!choreography || choreography.ownerId !== userId) return null;
  return choreography;
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;
  const { id } = await context.params;
  const choreography = await ownerChoreography(id, auth.session.userId);
  if (!choreography) return NextResponse.json({ error: "Chorégraphie introuvable." }, { status: 404 });

  const memberships = await prisma.membership.findMany({
    where: { choreographyId: id },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    members: memberships
      .filter((member) => member.role === "editor" || member.role === "viewer")
      .map((member) => ({
        id: member.id,
        email: member.email,
        role: member.role,
        pending: member.userId === null,
        name: member.user?.name ?? null,
      })),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;
  const { id } = await context.params;
  const choreography = await ownerChoreography(id, auth.session.userId);
  if (!choreography) return NextResponse.json({ error: "Chorégraphie introuvable." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const email = normalizeEmail(body?.email);
  const role = body?.role === "editor" || body?.role === "viewer" ? body.role : null;
  if (!email || !role) {
    return NextResponse.json({ error: "Indiquez une adresse e-mail et un droit." }, { status: 400 });
  }
  if (email === choreography.owner.email) {
    return NextResponse.json({ error: "Le créateur a déjà accès à cette chorégraphie." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const existing = await prisma.membership.findUnique({
    where: { choreographyId_email: { choreographyId: id, email } },
  });
  if (existing) {
    await prisma.membership.update({
      where: { id: existing.id },
      data: { role, userId: user?.id ?? existing.userId },
    });
  } else {
    await prisma.membership.create({
      data: { choreographyId: id, email, role, userId: user?.id ?? null },
    });
  }

  return NextResponse.json({ ok: true });
}
