import type { PrismaClient } from "@prisma/client";
import { createSourceWriteTarget, finalizeSourceFile, readSourceFile, removeSourceFile, removeSourceTemporary, writeSourceTemporary } from "./storage.ts";
import { validateSourceUpload } from "./validation.ts";

export class SourceNotFound extends Error {}
const fileStorage = { createSourceWriteTarget, finalizeSourceFile, readSourceFile, removeSourceFile, removeSourceTemporary, writeSourceTemporary };

export async function importSource(database: PrismaClient, input: { userId: string; coursePartId: string | null; fileName: string; declaredMime: string; bytes: Uint8Array }, storage = fileStorage): Promise<{ sourceAssetId: string; duplicate: boolean }> {
  const metadata = validateSourceUpload(input);
  const target = await storage.createSourceWriteTarget();
  let published = false;
  try {
    await storage.writeSourceTemporary(target.temporaryPath, input.bytes);
    return await database.$transaction(async (transaction) => {
      // Serialize identical content for this account; PostgreSQL also enforces UNIQUE.
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${metadata.sha256}`}, 0))::text`;
      if (input.coursePartId && !await transaction.coursePart.findFirst({ where: { id: input.coursePartId, userId: input.userId }, select: { id: true } })) throw new SourceNotFound();
      let asset = await transaction.sourceAsset.findUnique({ where: { userId_sha256: { userId: input.userId, sha256: metadata.sha256 } } });
      const duplicate = Boolean(asset);
      if (asset) {
        await storage.readSourceFile(asset.storageKey);
      } else {
        asset = await transaction.sourceAsset.create({ data: { userId: input.userId, sha256: metadata.sha256, storageKey: target.storageKey, mimeType: metadata.mimeType, byteSize: metadata.byteSize } });
      }
      await transaction.sourceImport.create({ data: { userId: input.userId, sourceAssetId: asset.id, originalFileName: metadata.fileName, declaredMimeType: input.declaredMime || null, wasDuplicate: duplicate } });
      if (input.coursePartId && !duplicate) {
        await transaction.sourcePlacement.create({ data: { userId: input.userId, sourceAssetId: asset.id, coursePartId: input.coursePartId } });
        await transaction.coursePart.updateMany({ where: { id: input.coursePartId, userId: input.userId }, data: { state: "NORMAL" } });
      }
      if (!duplicate) {
        // Publish before commit so a visible row has its original. A refused
        // exclusive link must never authorize deleting a pre-existing file.
        await storage.finalizeSourceFile(target.temporaryPath, target.finalPath);
        published = true;
      }
      return { sourceAssetId: asset.id, duplicate };
    }, { maxWait: 15000, timeout: 30000 });
  } catch (error) {
    if (published) {
      // A lost COMMIT response is ambiguous. Never delete a possibly committed
      // original. If the DB is unreachable, retain the orphan for reconciliation.
      try {
        const committed = await database.sourceAsset.findUnique({ where: { storageKey: target.storageKey }, select: { id: true } });
        if (!committed) await storage.removeSourceFile(target.storageKey);
      } catch { /* Reconcile after recovery; no destructive guess. */ }
    }
    throw error;
  } finally { await storage.removeSourceTemporary(target.temporaryPath); }
}
