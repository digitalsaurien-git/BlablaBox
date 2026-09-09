"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/auth/session";
import { CourseMutationError, createPart, updatePart, reorderParts, placeSource } from "@/lib/courses/mutations";
import { parseExpectedVersion, parseOptionalId, parseYear, readCourseText } from "@/lib/courses/validation";

function readText(formData: FormData, name: string, maxLength = 180): string {
  const raw = formData.get(name);
  const value = readCourseText(raw, "", maxLength);
  if (typeof raw === "string" && raw.trim() && !value) coursesError("invalid-fields");
  return value;
}

function readId(formData: FormData, name: string): string | null {
  return parseOptionalId(formData.get(name));
}

function coursesError(code: string): never {
  if (code === "not-found" || code === "inconsistent-chapter") notFound();
  redirect(`/courses?error=${encodeURIComponent(code)}`);
}

export async function createSchoolYear(formData: FormData) {
  const user = await requireCurrentUser();
  const label = readText(formData, "label", 80);
  if (!label) coursesError("year-required");
  try {
    await prisma.schoolYear.create({ data: { userId: user.id, label, startYear: parseYear(formData.get("startYear")), endYear: parseYear(formData.get("endYear")) } });
  } catch (error) { writeError(error); }
  revalidatePath("/courses");
  redirect("/courses");
}

export async function createSubject(formData: FormData) {
  const user = await requireCurrentUser();
  const schoolYearId = readId(formData, "schoolYearId");
  const title = readText(formData, "title", 120);
  if (!schoolYearId || !title) coursesError("subject-required");
  const year = await prisma.schoolYear.findFirst({ where: { id: schoolYearId, userId: user.id } });
  if (!year) coursesError("not-found");
  try { await prisma.subject.create({ data: { userId: user.id, schoolYearId, title } }); }
  catch (error) { writeError(error); }
  revalidatePath("/courses");
  redirect("/courses");
}

export async function updateSchoolYear(formData: FormData) {
  const user = await requireCurrentUser();
  const id = readId(formData, "schoolYearId");
  const label = readText(formData, "label", 80);
  if (!id || !label) coursesError("year-required");
  const updated = await prisma.schoolYear.updateMany({ where: { id, userId: user.id }, data: { label } }).catch(writeError);
  if (updated.count !== 1) coursesError("not-found");
  revalidatePath("/courses");
  redirect("/courses");
}

export async function createCourseTheme(formData: FormData) {
  const user = await requireCurrentUser();
  const subjectId = readId(formData, "subjectId");
  const title = readText(formData, "title", 160);
  if (!subjectId || !title) coursesError("theme-required");
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId: user.id } });
  if (!subject) coursesError("not-found");
  try { await prisma.courseTheme.create({ data: { userId: user.id, subjectId, title } }); }
  catch (error) { writeError(error); }
  revalidatePath("/courses");
  redirect("/courses");
}

export async function updateSubject(formData: FormData) {
  const user = await requireCurrentUser();
  const id = readId(formData, "subjectId");
  const title = readText(formData, "title", 120);
  if (!id || !title) coursesError("subject-required");
  const updated = await prisma.subject.updateMany({ where: { id, userId: user.id }, data: { title } }).catch(writeError);
  if (updated.count !== 1) coursesError("not-found");
  revalidatePath("/courses");
  redirect("/courses");
}

export async function updateCourseTheme(formData: FormData) {
  const user = await requireCurrentUser();
  const id = readId(formData, "courseThemeId");
  const title = readText(formData, "title", 160);
  if (!id || !title) coursesError("theme-required");
  const updated = await prisma.courseTheme.updateMany({ where: { id, userId: user.id }, data: { title } }).catch(writeError);
  if (updated.count !== 1) coursesError("not-found");
  revalidatePath("/courses");
  redirect("/courses");
}

export async function createChapter(formData: FormData) {
  const user = await requireCurrentUser();
  const courseThemeId = readId(formData, "courseThemeId");
  const title = readText(formData, "title", 160);
  if (!courseThemeId || !title) coursesError("chapter-required");
  const theme = await prisma.courseTheme.findFirst({ where: { id: courseThemeId, userId: user.id } });
  if (!theme) coursesError("not-found");
  try { await prisma.chapter.create({ data: { userId: user.id, courseThemeId, title } }); }
  catch (error) { writeError(error); }
  revalidatePath("/courses");
  redirect("/courses");
}

export async function updateChapter(formData: FormData) {
  const user = await requireCurrentUser();
  const id = readId(formData, "chapterId");
  const title = readText(formData, "title", 160);
  if (!id || !title) coursesError("chapter-required");
  const updated = await prisma.chapter.updateMany({ where: { id, userId: user.id }, data: { title } }).catch(writeError);
  if (updated.count !== 1) coursesError("not-found");
  revalidatePath("/courses");
  redirect("/courses");
}

function writeError(error: unknown): never {
  if (error instanceof CourseMutationError) coursesError(error.message);
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") coursesError("already-exists");
  coursesError("write-failed");
}

function version(formData: FormData): number {
  const value = parseExpectedVersion(formData.get("orderVersion"));
  if (value === null) coursesError("stale-order");
  return value;
}

function done(): never {
  revalidatePath("/courses");
  redirect("/courses");
}

export async function createCoursePart(formData: FormData) {
  const user = await requireCurrentUser();
  const themeId = readId(formData, "courseThemeId");
  if (!themeId) coursesError("not-found");
  const referenceLabel = readText(formData, "referenceLabel", 80) || null;
  const title = readText(formData, "title") || (referenceLabel ? `Partie ${referenceLabel}` : "Nouvelle partie");
  await createPart(prisma, user.id, themeId, version(formData), { title, referenceLabel, chapterId: readId(formData, "chapterId"), state: formData.get("documentExpected") === "on" ? "DOCUMENT_EXPECTED" : "NORMAL" }).catch(writeError);
  done();
}

export async function updateCoursePart(formData: FormData) {
  const user = await requireCurrentUser();
  const partId = readId(formData, "partId");
  const title = readText(formData, "title");
  if (!partId) coursesError("not-found");
  if (!title) coursesError("part-title-required");
  await updatePart(prisma, user.id, partId, version(formData), { title, referenceLabel: readText(formData, "referenceLabel", 80) || null, chapterId: readId(formData, "chapterId") }).catch(writeError);
  done();
}

export async function sortCourseThemeParts(formData: FormData) {
  const user = await requireCurrentUser();
  const themeId = readId(formData, "courseThemeId");
  if (!themeId) coursesError("not-found");
  await reorderParts(prisma, user.id, themeId, version(formData)).catch(writeError);
  done();
}

export async function moveCoursePart(formData: FormData) {
  const user = await requireCurrentUser();
  const partId = readId(formData, "partId");
  const direction = formData.get("direction");
  if (!partId) coursesError("not-found");
  if (direction !== "up" && direction !== "down") coursesError("invalid-fields");
  const part = await prisma.coursePart.findFirst({ where: { id: partId, userId: user.id }, select: { courseThemeId: true } });
  if (!part) coursesError("not-found");
  await reorderParts(prisma, user.id, part.courseThemeId, version(formData), { partId, direction }).catch(writeError);
  done();
}

export async function confirmDuplicatePlacement(formData: FormData) {
  const user = await requireCurrentUser();
  const sourceAssetId = readId(formData, "sourceAssetId");
  const coursePartId = readId(formData, "coursePartId");
  if (!sourceAssetId || !coursePartId) coursesError("not-found");
  await placeSource(prisma, user.id, sourceAssetId, coursePartId).catch(writeError);
  done();
}
