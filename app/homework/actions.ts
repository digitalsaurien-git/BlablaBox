"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  HomeworkMutationError,
  createHomework,
  updateHomeworkStatus,
  linkHomeworkToCourse,
  softDeleteHomework,
} from "@/lib/homework/mutations";

function homeworkError(code: string): never {
  redirect(`/homework?error=${encodeURIComponent(code)}`);
}

export async function createHomeworkAction(formData: FormData) {
  const user = await requireCurrentUser();

  const dueDateRaw = formData.get("dueDate");
  const subjectLabel = (formData.get("subjectLabel") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() ?? "";
  const courseThemeId = (formData.get("courseThemeId") as string | null)?.trim() || null;

  if (!dueDateRaw || !subjectLabel || !description) homeworkError("missing-fields");

  const dueDate = new Date(dueDateRaw as string);
  if (isNaN(dueDate.getTime())) homeworkError("invalid-date");

  // Try to auto-match course theme if not provided
  let resolvedThemeId = courseThemeId;
  let courseUnresolved = false;

  if (!resolvedThemeId) {
    // Look for a subject + theme matching subjectLabel (case-insensitive)
    const matchedSubject = await prisma.subject.findFirst({
      where: {
        userId: user.id,
        title: { equals: subjectLabel, mode: "insensitive" },
      },
      select: { id: true, themes: { where: { deletedAt: null }, select: { id: true }, take: 1 } },
    });
    if (matchedSubject && matchedSubject.themes.length > 0) {
      resolvedThemeId = matchedSubject.themes[0].id;
    } else {
      courseUnresolved = true;
    }
  }

  try {
    await createHomework(prisma, user.id, {
      dueDate,
      subjectLabel,
      description,
      courseThemeId: resolvedThemeId,
      courseUnresolved,
    });
  } catch {
    homeworkError("create-failed");
  }

  revalidatePath("/homework");
}

export async function updateHomeworkStatusAction(
  homeworkId: string,
  status: "TODO" | "IN_PROGRESS" | "DONE",
) {
  const user = await requireCurrentUser();
  try {
    await updateHomeworkStatus(prisma, user.id, homeworkId, status);
  } catch (err) {
    if (err instanceof HomeworkMutationError) homeworkError(err.message);
    homeworkError("update-failed");
  }
  revalidatePath("/homework");
}

export async function linkHomeworkToCourseAction(
  homeworkId: string,
  courseThemeId: string,
) {
  const user = await requireCurrentUser();
  try {
    await linkHomeworkToCourse(prisma, user.id, homeworkId, courseThemeId);
  } catch (err) {
    if (err instanceof HomeworkMutationError) homeworkError(err.message);
    homeworkError("link-failed");
  }
  revalidatePath("/homework");
}

export async function deleteHomeworkAction(homeworkId: string) {
  const user = await requireCurrentUser();
  try {
    await softDeleteHomework(prisma, user.id, homeworkId);
  } catch (err) {
    if (err instanceof HomeworkMutationError) homeworkError(err.message);
    homeworkError("delete-failed");
  }
  revalidatePath("/homework");
}
