import type { Prisma, PrismaClient } from "@prisma/client";
import { compareNaturalReferences, parseNaturalSegments } from "./ordering.ts";
import { normalizeCourseText } from "./smart-analysis.ts";
import { CourseMutationError } from "./mutations.ts";
import { createSourceWriteTarget, finalizeSourceFile, readSourceFile, removeSourceFile, removeSourceTemporary, writeSourceTemporary } from "../sources/storage.ts";
import { validateSourceUpload } from "../sources/validation.ts";

const fileStorage = { createSourceWriteTarget, finalizeSourceFile, readSourceFile, removeSourceFile, removeSourceTemporary, writeSourceTemporary };

type SmartImportInput = {
  userId: string;
  subjectId: string;
  courseTitle: string;
  existingThemeId: string | null;
  expectedOrderVersion: number | null;
  referenceLabel: string | null;
  partTitle: string;
  fileName: string;
  declaredMime: string;
  bytes: Uint8Array;
};

type SmartStorage = typeof fileStorage;

async function lock(transaction: Prisma.TransactionClient, key: string): Promise<void> {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}

export async function importSmartCourse(database: PrismaClient, input: SmartImportInput, storage: SmartStorage = fileStorage) {
  const metadata = validateSourceUpload(input);
  const target = await storage.createSourceWriteTarget();
  let published = false;
  try {
    await storage.writeSourceTemporary(target.temporaryPath, input.bytes);
    return await database.$transaction(async (transaction) => {
      await lock(transaction, `source:${input.userId}:${metadata.sha256}`);
      await lock(transaction, `course:${input.userId}:${input.subjectId}:${normalizeCourseText(input.courseTitle)}`);

      const subject = await transaction.subject.findFirst({ where: { id: input.subjectId, userId: input.userId }, select: { id: true } });
      if (!subject) throw new CourseMutationError("not-found");

      let asset = await transaction.sourceAsset.findUnique({ where: { userId_sha256: { userId: input.userId, sha256: metadata.sha256 } } });
      const duplicate = Boolean(asset);
      if (asset) await storage.readSourceFile(asset.storageKey);
      else asset = await transaction.sourceAsset.create({ data: { userId: input.userId, sha256: metadata.sha256, storageKey: target.storageKey, mimeType: metadata.mimeType, byteSize: metadata.byteSize } });

      const themes = await transaction.courseTheme.findMany({ where: { userId: input.userId, subjectId: input.subjectId, deletedAt: null } });
      let theme = input.existingThemeId ? themes.find((candidate) => candidate.id === input.existingThemeId) : undefined;
      if (input.existingThemeId && !theme) throw new CourseMutationError("not-found");
      theme ??= themes.find((candidate) => normalizeCourseText(candidate.title) === normalizeCourseText(input.courseTitle));
      const createdTheme = !theme;
      if (!theme) theme = await transaction.courseTheme.create({ data: { userId: input.userId, subjectId: input.subjectId, title: input.courseTitle } });

      const existingParts = await transaction.coursePart.findMany({ where: { userId: input.userId, courseThemeId: theme.id }, orderBy: [{ position: "asc" }, { id: "asc" }] });
      let part = input.referenceLabel
        ? existingParts.find((candidate) => normalizeCourseText(candidate.referenceLabel ?? "") === normalizeCourseText(input.referenceLabel ?? ""))
        : undefined;
      const reusedPart = Boolean(part);
      if (!part) {
        if (!createdTheme) {
          const expected = input.expectedOrderVersion ?? theme.orderVersion;
          const updated = await transaction.courseTheme.updateMany({ where: { id: theme.id, userId: input.userId, orderVersion: expected }, data: { orderVersion: { increment: 1 } } });
          if (updated.count !== 1) throw new CourseMutationError("stale-order");
        } else {
          await transaction.courseTheme.update({ where: { id: theme.id }, data: { orderVersion: 1 } });
        }
        part = await transaction.coursePart.create({ data: {
          userId: input.userId,
          courseThemeId: theme.id,
          chapterId: null,
          title: input.partTitle,
          referenceLabel: input.referenceLabel,
          sortSegments: parseNaturalSegments(input.referenceLabel),
          position: existingParts.length,
          state: "NORMAL",
        } });
        if (input.referenceLabel && parseNaturalSegments(input.referenceLabel).length) {
          const ordered = [...existingParts, part].sort(compareNaturalReferences);
          for (const [position, candidate] of ordered.entries()) await transaction.coursePart.updateMany({ where: { id: candidate.id, userId: input.userId }, data: { position } });
        }
      }

      await transaction.sourceImport.create({ data: { userId: input.userId, sourceAssetId: asset.id, originalFileName: metadata.fileName, declaredMimeType: input.declaredMime || null, wasDuplicate: duplicate } });
      await transaction.sourcePlacement.createMany({ data: [{ userId: input.userId, sourceAssetId: asset.id, coursePartId: part.id }], skipDuplicates: true });
      await transaction.coursePart.updateMany({ where: { id: part.id, userId: input.userId }, data: { state: "NORMAL" } });

      if (!duplicate) {
        await storage.finalizeSourceFile(target.temporaryPath, target.finalPath);
        published = true;
      }
      return { sourceAssetId: asset.id, themeId: theme.id, partId: part.id, duplicate, createdTheme, reusedPart };
    }, { maxWait: 15_000, timeout: 30_000 });
  } catch (error) {
    if (published) {
      try {
        const committed = await database.sourceAsset.findUnique({ where: { storageKey: target.storageKey }, select: { id: true } });
        if (!committed) await storage.removeSourceFile(target.storageKey);
      } catch { /* Preserve an original if commit state cannot be established. */ }
    }
    throw error;
  } finally {
    await storage.removeSourceTemporary(target.temporaryPath);
  }
}
