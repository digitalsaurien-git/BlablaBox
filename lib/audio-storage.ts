import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_AUDIO_DIRECTORY = "storage/audio";

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

export function resolveStoredAudioPath(fileName: string): string {
  if (!fileName || path.basename(fileName) !== fileName || !fileName.endsWith(".mp3")) {
    throw new Error("Référence de fichier audio invalide.");
  }
  return assertInsideStorage(path.join(getAudioStorageRoot(), fileName));
}

export async function removeStoredAudio(fileName: string | null): Promise<void> {
  if (!fileName) return;
  await rm(resolveStoredAudioPath(fileName), { force: true });
}

export async function removeTemporaryAudio(temporaryPath: string): Promise<void> {
  try {
    await rm(assertInsideStorage(temporaryPath), { force: true });
  } catch {
    // Cleanup must not replace the original generation error.
  }
}
