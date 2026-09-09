import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SOURCE_STORAGE_ROOT = "storage/sources";

export function getSourceStorageRoot(): string {
  if (process.env.NODE_ENV === "production" && (!process.env.SOURCE_STORAGE_ROOT || !path.isAbsolute(process.env.SOURCE_STORAGE_ROOT))) {
    throw new Error("Un stockage persistant absolu doit être configuré.");
  }
  const root = path.resolve(process.env.SOURCE_STORAGE_ROOT ?? path.join(process.cwd(), DEFAULT_SOURCE_STORAGE_ROOT));
  const publicRoot = path.resolve(process.cwd(), "public");
  const relativeToPublic = path.relative(publicRoot, root);
  if (root === publicRoot || (!relativeToPublic.startsWith("..") && !path.isAbsolute(relativeToPublic))) {
    throw new Error("Le stockage des sources ne peut pas être placé dans public.");
  }
  return root;
}

async function assertNoLinks(candidate: string): Promise<void> {
  let current = path.resolve(candidate);
  while (true) {
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (info?.isSymbolicLink()) throw new Error("Les liens de stockage sont refusés.");
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

async function verifiedPath(candidate: string): Promise<string> {
  const safePath = assertInsideStorage(candidate);
  await assertNoLinks(safePath);
  const root = await realpath(getSourceStorageRoot());
  const publicRoot = await realpath(path.resolve(process.cwd(), "public")).catch(() => path.resolve(process.cwd(), "public"));
  const relative = path.relative(publicRoot, root);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) throw new Error("Stockage public refusé.");
  return safePath;
}

function assertInsideStorage(candidate: string): string {
  const root = getSourceStorageRoot();
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Chemin de source invalide.");
  }
  return resolved;
}

export async function createSourceWriteTarget(): Promise<{
  storageKey: string;
  temporaryPath: string;
  finalPath: string;
}> {
  const root = getSourceStorageRoot();
  await assertNoLinks(root);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const storageKey = randomUUID();
  return {
    storageKey,
    temporaryPath: assertInsideStorage(path.join(root, `.${storageKey}.tmp`)),
    finalPath: assertInsideStorage(path.join(root, storageKey)),
  };
}

export async function writeSourceTemporary(temporaryPath: string, bytes: Uint8Array): Promise<void> {
  const safePath = await verifiedPath(temporaryPath);
  await writeFile(safePath, bytes, { flag: "wx", mode: 0o600 });
}

export async function finalizeSourceFile(temporaryPath: string, finalPath: string): Promise<void> {
  const safeTemporaryPath = await verifiedPath(temporaryPath);
  const safeFinalPath = await verifiedPath(finalPath);
  const fileStats = await lstat(safeTemporaryPath);
  if (!fileStats.isFile() || fileStats.size === 0) throw new Error("Le fichier source est vide ou invalide.");
  // Hard-link publication is atomic and fails if the destination already exists.
  // Both names are on the same volume; no replacement of an existing original.
  await link(safeTemporaryPath, safeFinalPath);
  // Once linked, report publication success even if temporary cleanup fails.
  // The importer retries temporary cleanup in its finally block.
  await rm(safeTemporaryPath).catch(() => undefined);
}

export function resolveSourcePath(storageKey: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storageKey)) throw new Error("Référence de source invalide.");
  return assertInsideStorage(path.join(getSourceStorageRoot(), storageKey));
}

export async function removeSourceFile(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) return;
  await rm(await verifiedPath(resolveSourcePath(storageKey)), { force: true });
}

export async function removeSourceTemporary(temporaryPath: string): Promise<void> {
  try {
    await rm(await verifiedPath(temporaryPath), { force: true });
  } catch {
    // Preserve the original import error.
  }
}

export function safeDownloadFileName(originalFileName: string): string {
  const baseName = path.posix.basename(originalFileName.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f-\u009f"\\/]+/g, " ");
  const normalized = baseName.replace(/\s+/g, " ").trim().slice(0, 180);
  return normalized || "document-source";
}

export function sourceContentDisposition(originalFileName: string): string {
  const name = safeDownloadFileName(originalFileName).toWellFormed();
  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function readSourceFile(storageKey: string): Promise<Uint8Array> {
  const filePath = await verifiedPath(resolveSourcePath(storageKey));
  const info = await lstat(filePath);
  if (!info.isFile() || info.size === 0) throw new Error("Source indisponible.");
  return new Uint8Array(await readFile(filePath));
}
