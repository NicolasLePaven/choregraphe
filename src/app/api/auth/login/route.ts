import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/validate";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "E-mail ou mot de passe incorrect." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "E-mail ou mot de passe incorrect." }, { status: 401 });
  }

  await prisma.membership.updateMany({
    where: { email, userId: null },
    data: { userId: user.id },
  });
  await setSessionCookie({ userId: user.id, email: user.email, name: user.name });
  return NextResponse.json({ id: user.id, name: user.name, email: user.email });
}
