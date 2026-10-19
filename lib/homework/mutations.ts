import type { PrismaClient } from "@prisma/client";

export class HomeworkMutationError extends Error {}

export type HomeworkFields = {
  dueDate: Date;
  subjectLabel: string;
  description: string;
  courseThemeId?: string | null;
  courseUnresolved?: boolean;
};

export async function createHomework(
  database: PrismaClient,
  userId: string,
  fields: HomeworkFields,
) {
  return database.homework.create({
    data: {
      userId,
      dueDate: fields.dueDate,
      subjectLabel: fields.subjectLabel.trim().slice(0, 120),
      description: fields.description.trim(),
      courseThemeId: fields.courseThemeId ?? null,
      courseUnresolved: fields.courseUnresolved ?? false,
      status: "TODO",
    },
  });
}

export async function updateHomeworkStatus(
  database: PrismaClient,
  userId: string,
  homeworkId: string,
  status: "TODO" | "IN_PROGRESS" | "DONE",
) {
  const result = await database.homework.updateMany({
    where: { id: homeworkId, userId, deletedAt: null },
    data: { status },
  });
  if (result.count === 0) throw new HomeworkMutationError("not-found");
}

export async function linkHomeworkToCourse(
  database: PrismaClient,
  userId: string,
  homeworkId: string,
  courseThemeId: string,
) {
  // Verify the theme belongs to this user
  const theme = await database.courseTheme.findFirst({
    where: { id: courseThemeId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!theme) throw new HomeworkMutationError("course-not-found");

  const result = await database.homework.updateMany({
    where: { id: homeworkId, userId, deletedAt: null },
    data: { courseThemeId, courseUnresolved: false },
  });
  if (result.count === 0) throw new HomeworkMutationError("not-found");
}

export async function softDeleteHomework(
  database: PrismaClient,
  userId: string,
  homeworkId: string,
) {
  const result = await database.homework.updateMany({
    where: { id: homeworkId, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) throw new HomeworkMutationError("not-found");
}
