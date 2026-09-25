"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ownedProjectWhere } from "@/lib/auth/ownership";
import { requireCurrentUser } from "@/lib/auth/session";
import { MSG_GENERATION_FAILED, MSG_GENERATION_CONCURRENT_EDIT } from "@/lib/messages";
import {
  createLearningTitle,
  responseModeToDeliveryType,
  responseModeToDuration,
  sanitizeLearningSources,
} from "@/lib/learning-content";
import { getLLMProvider } from "@/lib/providers/llm";
import type {
  AdaptationMode,
  ResearchMode,
  ResponseMode,
  VocabularyLevel,
} from "@/lib/providers/llm";
import { resolveResearchMode } from "@/lib/research-policy";
import { checkLLMRateLimit } from "@/lib/auth/action-rate-limit";
import { readString, readAllowed } from "@/lib/actions/form-helpers";

const audiences = ["10-12 ans", "Collège", "Lycée", "Adulte"] as const;
const levels = ["Débutant", "Intermédiaire", "Avancé"] as const;
const responseModes: ResponseMode[] = ["EXPLAIN", "STORY", "REVIEW", "QUICK"];
const vocabularyLevels: VocabularyLevel[] = ["VERY_SIMPLE", "COMMON", "PRECISE"];
const adaptationModes: AdaptationMode[] = ["STANDARD", "FOCUS", "EASY_READING", "MEMORY"];

function sourceWrites(sources: ReturnType<typeof sanitizeLearningSources>) {
  return sources.map((source) => ({
    url: source.url,
    title: source.title ?? null,
    domain: source.domain ?? null,
    sourceOrder: source.sourceOrder,
    citationStart: source.citationStart ?? null,
    citationEnd: source.citationEnd ?? null,
  }));
}

function publicGenerationError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message.slice(0, 500)
    : MSG_GENERATION_FAILED;
}

export async function createUnderstandProject(formData: FormData) {
  const user = await requireCurrentUser();
  const userRequest = readString(formData, "userRequest");
  if (!userRequest) redirect("/understand/new?error=missing-request");
  if (!checkLLMRateLimit(user.id)) {
    redirect("/understand/new?error=rate-limited");
  }

  const responseMode = readAllowed(readString(formData, "responseMode"), responseModes, "EXPLAIN");
  const audience = readAllowed(readString(formData, "audience"), audiences, "Collège");
  const level = readAllowed(readString(formData, "level"), levels, "Intermédiaire");
  const vocabularyLevel = readAllowed(
    readString(formData, "vocabularyLevel"),
    vocabularyLevels,
    "COMMON",
  );
  const adaptationMode = readAllowed(
    readString(formData, "adaptationMode"),
    adaptationModes,
    "STANDARD",
  );
  const researchMode = resolveResearchMode(responseMode, userRequest);
  const title = createLearningTitle(userRequest);
  let projectId: string;

  try {
    const result = await getLLMProvider().generateLearningContent({
      title,
      userRequest,
      audience,
      level,
      vocabularyLevel,
      adaptationMode,
      responseMode,
      researchMode,
    });
    const sources = sanitizeLearningSources(result.sources);
    const project = await prisma.project.create({
      data: {
        title,
        userId: user.id,
        sourceContent: userRequest,
        targetDurationMinutes: responseModeToDuration(responseMode),
        audience,
        tone: responseMode === "STORY" ? "Narratif et vivant" : "Clair et vivant",
        level,
        learningObjective: `Répondre clairement à la demande : ${userRequest}`,
        deliveryType: responseModeToDeliveryType(responseMode),
        projectKind: "UNDERSTAND_LISTEN",
        responseMode,
        vocabularyLevel,
        adaptationMode,
        researchMode,
        researchUsed: result.researchUsed,
        script: result.content,
        scriptStatus: "SCRIPT_GENERATED",
        contentVersion: 1,
        audioStatus: "NOT_GENERATED",
        audioContentVersion: null,
        audioFormat: "mp3",
        errorMessage: null,
        sources: sources.length ? { create: sourceWrites(sources) } : undefined,
      },
    });
    projectId = project.id;
  } catch (error) {
    const project = await prisma.project.create({
      data: {
        title,
        userId: user.id,
        sourceContent: userRequest,
        targetDurationMinutes: responseModeToDuration(responseMode),
        audience,
        tone: responseMode === "STORY" ? "Narratif et vivant" : "Clair et vivant",
        level,
        learningObjective: `Répondre clairement à la demande : ${userRequest}`,
        deliveryType: responseModeToDeliveryType(responseMode),
        projectKind: "UNDERSTAND_LISTEN",
        responseMode,
        vocabularyLevel,
        adaptationMode,
        researchMode,
        researchUsed: false,
        scriptStatus: "SCRIPT_FAILED",
        contentVersion: 1,
        audioStatus: "NOT_GENERATED",
        audioContentVersion: null,
        errorMessage: publicGenerationError(error),
      },
    });
    projectId = project.id;
  }

  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

export async function regenerateUnderstandProject(formData: FormData) {
  const user = await requireCurrentUser();
  const projectId = readString(formData, "projectId");
  if (!projectId) redirect("/projects");

  const project = await prisma.project.findFirst({
    where: ownedProjectWhere(user.id, projectId),
  });
  if (!project || project.projectKind !== "UNDERSTAND_LISTEN") redirect("/projects");
  if (!checkLLMRateLimit(user.id)) {
    redirect(`/projects/${project.id}?error=rate-limited`);
  }

  const responseMode = (project.responseMode ?? "EXPLAIN") as ResponseMode;
  const researchMode = resolveResearchMode(responseMode, project.sourceContent) as ResearchMode;

  try {
    const result = await getLLMProvider().generateLearningContent({
      title: project.title,
      userRequest: project.sourceContent,
      audience: project.audience,
      level: project.level,
      vocabularyLevel: project.vocabularyLevel as VocabularyLevel,
      adaptationMode: project.adaptationMode as AdaptationMode,
      responseMode,
      researchMode,
    });
    const sources = sanitizeLearningSources(result.sources);

    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.project.updateMany({
        where: {
          ...ownedProjectWhere(user.id, project.id),
          contentVersion: project.contentVersion,
        },
        data: {
          script: result.content,
          scriptStatus: "SCRIPT_GENERATED",
          contentVersion: { increment: 1 },
          researchMode,
          researchUsed: result.researchUsed,
          audioStatus: "NOT_GENERATED",
          audioErrorMessage: null,
          errorMessage: null,
        },
      });
      if (updated.count !== 1) throw new Error(MSG_GENERATION_CONCURRENT_EDIT);
      await transaction.projectSource.deleteMany({
        where: { projectId: project.id, project: { userId: user.id } },
      });
      if (sources.length) {
        await transaction.projectSource.createMany({
          data: sourceWrites(sources).map((source) => ({ ...source, projectId: project.id })),
        });
      }
    });
  } catch (error) {
    await prisma.project.updateMany({
      where: ownedProjectWhere(user.id, project.id),
      data: {
        scriptStatus: "SCRIPT_FAILED",
        errorMessage: publicGenerationError(error),
      },
    });
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);
  redirect(`/projects/${project.id}`);
}
