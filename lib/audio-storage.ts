import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_AUDIO_DIRECTORY = "storage/audio";
const AUDIO_MANIFEST_VERSION = 1;

export type StoredAudioSegment = {
  fileName: string;
  durationSeconds?: number;
};

export type StoredAudioPlayback = {
  segmented: boolean;
  segments: StoredAudioSegment[];
};

export function getAudioStorageRoot(): string {
  return path.resolve(process.env.AUDIO_STORAGE_PATH ?? path.join(process.cwd(), DEFAULT_AUDIO_DIRECTORY));
}

function assertInsideStorage(candidate: string): string {
  const root = getAudioStorageRoot();
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Chemin audio invalide.");
  }

  return resolved;
}

export async function createAudioWriteTarget() {
  const root = getAudioStorageRoot();
  await mkdir(root, { recursive: true });
  const token = randomUUID();
  const fileName = `${token}.mp3`;

  return {
    fileName,
    temporaryPath: assertInsideStorage(path.join(root, `.${token}.tmp`)),
    finalPath: assertInsideStorage(path.join(root, fileName)),
  };
}

export async function finalizeAudioFile(temporaryPath: string, finalPath: string): Promise<void> {
  const safeTemporaryPath = assertInsideStorage(temporaryPath);
  const safeFinalPath = assertInsideStorage(finalPath);
  const fileStats = await stat(safeTemporaryPath);

  if (!fileStats.isFile() || fileStats.size === 0) {
    throw new Error("Le fichier audio généré est vide ou invalide.");
  }

  await rename(safeTemporaryPath, safeFinalPath);
}

function assertStoredFileName(fileName: string, extension: ".mp3" | ".json"): string {
  if (!fileName || path.basename(fileName) !== fileName || !fileName.endsWith(extension)) {
    throw new Error("Référence de fichier audio invalide.");
  }
  return fileName;
}

export function resolveStoredAudioPath(fileName: string): string {
  return assertInsideStorage(
    path.join(getAudioStorageRoot(), assertStoredFileName(fileName, ".mp3")),
  );
}

function resolveStoredManifestPath(fileName: string): string {
  return assertInsideStorage(
    path.join(getAudioStorageRoot(), assertStoredFileName(fileName, ".json")),
  );
}

function parseAudioManifest(serialized: string): StoredAudioPlayback {
  const parsed = JSON.parse(serialized) as {
    version?: unknown;
    segments?: Array<{ fileName?: unknown; durationSeconds?: unknown }>;
  };
  if (
    parsed.version !== AUDIO_MANIFEST_VERSION ||
    !Array.isArray(parsed.segments) ||
    parsed.segments.length === 0
  ) {
    throw new Error("Manifeste audio invalide.");
  }

  const segments = parsed.segments.map((segment) => {
    const fileName = assertStoredFileName(String(segment.fileName ?? ""), ".mp3");
    const durationSeconds = typeof segment.durationSeconds === "number" &&
      Number.isFinite(segment.durationSeconds) && segment.durationSeconds >= 0
      ? segment.durationSeconds
      : undefined;
    return { fileName, durationSeconds };
  });

  return { segmented: segments.length > 1, segments };
}

export async function createStoredAudioManifest(
  segments: StoredAudioSegment[],
): Promise<string> {
  if (segments.length === 0) throw new Error("Aucun segment audio à enregistrer.");
  const safeSegments = segments.map((segment) => ({
    fileName: assertStoredFileName(segment.fileName, ".mp3"),
    ...(segment.durationSeconds === undefined
      ? {}
      : { durationSeconds: segment.durationSeconds }),
  }));
  const root = getAudioStorageRoot();
  await mkdir(root, { recursive: true });
  const token = randomUUID();
  const fileName = `${token}.json`;
  const temporaryPath = assertInsideStorage(path.join(root, `.${token}.manifest.tmp`));
  const finalPath = resolveStoredManifestPath(fileName);

  try {
    await writeFile(
      temporaryPath,
      JSON.stringify({ version: AUDIO_MANIFEST_VERSION, segments: safeSegments }),
      { encoding: "utf8", flag: "wx" },
    );
    await rename(temporaryPath, finalPath);
    return fileName;
  } catch (error) {
    await removeTemporaryAudio(temporaryPath);
    throw error;
  }
}

export async function getStoredAudioPlayback(
  fileName: string | null,
): Promise<StoredAudioPlayback | null> {
  if (!fileName) return null;
  if (fileName.endsWith(".mp3")) {
    return {
      segmented: false,
      segments: [{ fileName: assertStoredFileName(fileName, ".mp3") }],
    };
  }
  if (!fileName.endsWith(".json")) throw new Error("Référence audio inconnue.");
  const serialized = await readFile(resolveStoredManifestPath(fileName), "utf8");
  return parseAudioManifest(serialized);
}

export async function storedAudioExists(fileName: string | null): Promise<boolean> {
  if (!fileName) return false;
  try {
    const playback = await getStoredAudioPlayback(fileName);
    if (!playback) return false;
    const fileStats = await Promise.all(
      playback.segments.map((segment) => stat(resolveStoredAudioPath(segment.fileName))),
    );
    return fileStats.every((stats) => stats.isFile() && stats.size > 0);
  } catch {
    return false;
  }
}

export async function removeStoredAudio(fileName: string | null): Promise<void> {
  if (!fileName) return;
  if (fileName.endsWith(".mp3")) {
    await rm(resolveStoredAudioPath(fileName), { force: true });
    return;
  }

  const manifestPath = resolveStoredManifestPath(fileName);
  try {
    const playback = await getStoredAudioPlayback(fileName);
    await Promise.all(
      playback?.segments.map((segment) =>
        rm(resolveStoredAudioPath(segment.fileName), { force: true }),
      ) ?? [],
    );
  } finally {
    await rm(manifestPath, { force: true });
  }
}

export async function removeTemporaryAudio(temporaryPath: string): Promise<void> {
  try {
    await rm(assertInsideStorage(temporaryPath), { force: true });
  } catch {
    // Cleanup must not replace the original generation error.
  }
}
