import type { Prisma, PrismaClient } from "@prisma/client";
import { compareNaturalReferences, parseNaturalSegments } from "./ordering.ts";

export class CourseMutationError extends Error {}

async function lockOrder(transaction: Prisma.TransactionClient, userId: string, themeId: string, expectedVersion: number) {
  if (!await transaction.courseTheme.findFirst({ where: { id: themeId, userId }, select: { id: true } })) throw new CourseMutationError("not-found");
  const result = await transaction.courseTheme.updateMany({
    where: { id: themeId, userId, orderVersion: expectedVersion },
    data: { orderVersion: { increment: 1 } },
  });
  if (result.count !== 1) throw new CourseMutationError("stale-order");
}

type PartFields = { title: string; referenceLabel: string | null; chapterId: string | null };

async function checkChapter(transaction: Prisma.TransactionClient, userId: string, courseThemeId: string, chapterId: string | null) {
  if (chapterId && !await transaction.chapter.findFirst({ where: { id: chapterId, userId, courseThemeId }, select: { id: true } })) throw new CourseMutationError("not-found");
}

export async function createPart(database: PrismaClient, userId: string, themeId: string, expectedVersion: number, fields: PartFields & { state: "NORMAL" | "DOCUMENT_EXPECTED" }) {
  return database.$transaction(async (transaction) => {
    await lockOrder(transaction, userId, themeId, expectedVersion);
    await checkChapter(transaction, userId, themeId, fields.chapterId);
    const maximum = await transaction.coursePart.aggregate({ where: { userId, courseThemeId: themeId }, _max: { position: true } });
    return transaction.coursePart.create({ data: { ...fields, userId, courseThemeId: themeId, sortSegments: parseNaturalSegments(fields.referenceLabel), position: (maximum._max.position ?? -1) + 1 } });
  });
}

export async function updatePart(database: PrismaClient, userId: string, partId: string, expectedVersion: number, fields: PartFields) {
  return database.$transaction(async (transaction) => {
    const part = await transaction.coursePart.findFirst({ where: { id: partId, userId }, select: { courseThemeId: true } });
    if (!part) throw new CourseMutationError("not-found");
    await lockOrder(transaction, userId, part.courseThemeId, expectedVersion);
    await checkChapter(transaction, userId, part.courseThemeId, fields.chapterId);
    return transaction.coursePart.updateMany({ where: { id: partId, userId }, data: { ...fields, sortSegments: parseNaturalSegments(fields.referenceLabel) } });
  });
}

export async function reorderParts(database: PrismaClient, userId: string, themeId: string, expectedVersion: number, move?: { partId: string; direction: "up" | "down" }) {
  return database.$transaction(async (transaction) => {
    await lockOrder(transaction, userId, themeId, expectedVersion);
    // Read only AFTER acquiring the version lock; all membership/reference edits use it.
    const parts = await transaction.coursePart.findMany({ where: { userId, courseThemeId: themeId }, orderBy: [{ position: "asc" }, { id: "asc" }] });
    if (move) {
      const index = parts.findIndex((part) => part.id === move.partId);
      if (index < 0) throw new CourseMutationError("not-found");
      const target = index + (move.direction === "up" ? -1 : 1);
      if (target >= 0 && target < parts.length) [parts[index], parts[target]] = [parts[target], parts[index]];
    } else parts.sort(compareNaturalReferences);
    for (const [position, part] of parts.entries()) await transaction.coursePart.updateMany({ where: { id: part.id, userId }, data: { position } });
  });
}

export async function placeSource(database: PrismaClient, userId: string, sourceAssetId: string, coursePartId: string) {
  return database.$transaction(async (transaction) => {
    const asset = await transaction.sourceAsset.findFirst({ where: { id: sourceAssetId, userId }, select: { id: true } });
    const part = await transaction.coursePart.findFirst({ where: { id: coursePartId, userId }, select: { id: true } });
    if (!asset || !part) throw new CourseMutationError("not-found");
    await transaction.sourcePlacement.createMany({ data: [{ userId, sourceAssetId, coursePartId }], skipDuplicates: true });
    await transaction.coursePart.updateMany({ where: { id: coursePartId, userId }, data: { state: "NORMAL" } });
  });
}
