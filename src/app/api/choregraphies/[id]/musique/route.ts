import { NextResponse } from "next/server";
import { loadChoreography, requireApiSession } from "@/lib/access";
import { readMusic, removeMusicFiles, saveMusic } from "@/lib/music";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

function audioResponse(data: Uint8Array, type: string, status: number, extra: Record<string, string>) {
  return new NextResponse(Buffer.from(data), {
    status,
    headers: {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-cache",
      ...extra,
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;
  const { id } = await context.params;
  const loaded = await loadChoreography(id, auth.session.userId);
  if (!loaded) return NextResponse.json({ error: "Chorégraphie introuvable." }, { status: 404 });
  if (!loaded.choreography.musicFile) return NextResponse.json({ error: "Aucune musique." }, { status: 404 });

  const music = await readMusic(loaded.choreography.musicFile);
  if (!music) return NextResponse.json({ error: "Aucune musique." }, { status: 404 });

  const range = request.headers.get("range");
  if (!range) {
    return audioResponse(music.data, music.type, 200, { "Content-Length": String(music.size) });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${music.size}` } });
  }

  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : music.size - 1;
  if (!match[1] && match[2]) {
    const suffix = Number(match[2]);
    start = Math.max(0, music.size - suffix);
    end = music.size - 1;
  }
  if (!Number.isFinite(start)) start = 0;
  if (!Number.isFinite(end)) end = music.size - 1;
  end = Math.min(end, music.size - 1);
  if (start < 0 || start >= music.size || start > end) {
    return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${music.size}` } });
  }

  const slice = music.data.subarray(start, end + 1);
  return audioResponse(slice, music.type, 206, {
    "Content-Length": String(slice.byteLength),
    "Content-Range": `bytes ${start}-${end}/${music.size}`,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;
  const { id } = await context.params;
  const loaded = await loadChoreography(id, auth.session.userId);
  if (!loaded) return NextResponse.json({ error: "Chorégraphie introuvable." }, { status: 404 });
  if (loaded.role === "viewer") {
    return NextResponse.json({ error: "Cette chorégraphie est en lecture seule." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choisissez un fichier audio." }, { status: 400 });

  const saved = await saveMusic(id, file.name, Buffer.from(await file.arrayBuffer()));
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 400 });

  await prisma.choreography.update({
    where: { id },
    data: { musicFile: saved.musicFile, musicName: saved.musicName },
  });
  return NextResponse.json({ musicName: saved.musicName });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiSession();
  if (!auth.session) return auth.response;
  const { id } = await context.params;
  const loaded = await loadChoreography(id, auth.session.userId);
  if (!loaded) return NextResponse.json({ error: "Chorégraphie introuvable." }, { status: 404 });
  if (loaded.role === "viewer") {
    return NextResponse.json({ error: "Cette chorégraphie est en lecture seule." }, { status: 403 });
  }

  await removeMusicFiles(id);
  await prisma.choreography.update({
    where: { id },
    data: { musicFile: null, musicName: null },
  });
  return NextResponse.json({ ok: true });
}
