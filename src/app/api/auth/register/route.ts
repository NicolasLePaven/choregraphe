import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizePersonName } from "@/lib/validate";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const email = normalizeEmail(body?.email);
  const name = normalizePersonName(body?.name, 60);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !name) {
    return NextResponse.json({ error: "Indiquez un nom et une adresse e-mail valides." }, { status: 400 });
  }
  if (password.length < 8 || password.length > 80) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cette adresse." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { email, name, passwordHash } });
    await tx.membership.updateMany({
      where: { email, userId: null },
      data: { userId: created.id },
    });
    return created;
  });

  await setSessionCookie({ userId: user.id, email: user.email, name: user.name });
  return NextResponse.json({ id: user.id, name: user.name, email: user.email });
}
