import { copyFile, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const MUSIC_DIR = path.join(process.cwd(), "musiques");
const MAX_BYTES = 80 * 1024 * 1024;
const EXTENSIONS = ["mp3", "wav", "ogg", "m4a"] as const;

type MusicExtension = (typeof EXTENSIONS)[number];

const MIME: Record<MusicExtension, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
};

function isExtension(value: string): value is MusicExtension {
  return EXTENSIONS.includes(value as MusicExtension);
}

export function extensionOf(fileName: string): MusicExtension | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return isExtension(extension) ? extension : null;
}

export function musicContentType(storedName: string) {
  const extension = extensionOf(storedName);
  return extension ? MIME[extension] : "application/octet-stream";
}

export function musicFilePath(storedName: string) {
  if (!/^[A-Za-z0-9]+\.(mp3|wav|ogg|m4a)$/.test(storedName)) return null;
  return path.join(MUSIC_DIR, storedName);
}

export function musicDisplayName(original: string) {
  const base = original.split(/[/\\]/).pop() ?? "musique";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").trim();
  return (cleaned || "musique").slice(0, 120);
}

export async function removeMusicFiles(choreographyId: string) {
  const entries = await readdir(MUSIC_DIR).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((name) => name.startsWith(`${choreographyId}.`))
      .map((name) => unlink(path.join(MUSIC_DIR, name)).catch(() => undefined)),
  );
}

export async function saveMusic(choreographyId: string, originalName: string, bytes: Buffer) {
  const extension = extensionOf(originalName);
  if (!extension) return { error: "Choisissez un fichier mp3, wav, ogg ou m4a." as const };
  if (bytes.byteLength < 1) return { error: "Le fichier audio est vide." as const };
  if (bytes.byteLength > MAX_BYTES) return { error: "Le fichier dépasse 80 Mo." as const };
  await mkdir(MUSIC_DIR, { recursive: true });
  await removeMusicFiles(choreographyId);
  const musicFile = `${choreographyId}.${extension}`;
  await writeFile(path.join(MUSIC_DIR, musicFile), bytes);
  return { musicFile, musicName: musicDisplayName(originalName) };
}

export async function copyMusic(sourceStoredName: string, choreographyId: string) {
  const extension = extensionOf(sourceStoredName);
  const source = musicFilePath(sourceStoredName);
  if (!extension || !source) return null;
  const info = await stat(source).catch(() => null);
  if (!info) return null;
  await mkdir(MUSIC_DIR, { recursive: true });
  await removeMusicFiles(choreographyId);
  const musicFile = `${choreographyId}.${extension}`;
  await copyFile(source, path.join(MUSIC_DIR, musicFile));
  return musicFile;
}

export async function readMusic(storedName: string) {
  const target = musicFilePath(storedName);
  if (!target) return null;
  const info = await stat(target).catch(() => null);
  if (!info) return null;
  const data = await readFile(target);
  return { data, size: info.size, type: musicContentType(storedName) };
}
