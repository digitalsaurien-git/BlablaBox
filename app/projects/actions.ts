"use server";

import type { DeliveryType } from "@/lib/providers/llm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getLLMProvider } from "@/lib/providers/llm";
import { getTTSProvider } from "@/lib/providers/tts";
import { validateTTSScript, toPublicAudioError } from "@/lib/audio-generation";
import { removeStoredAudio } from "@/lib/audio-storage";
import { generateSegmentedStoredAudio } from "@/lib/segmented-audio-generation";

const allowedDeliveryTypes: DeliveryType[] = [
  "IMMERSIVE_STORY",
  "COURSE_SUMMARY",
  "MEMORY_AUDIO_CARD",
  "REVIEW_QA",
];
const allowedAudiences = ["10-12 ans", "Collège", "Lycée", "Adulte"];

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readDuration(formData: FormData): number {
  const value = Number(readString(formData, "targetDurationMinutes"));
  return [3, 5, 10, 15, 20].includes(value) ? value : 3;
}

function readDeliveryType(formData: FormData): DeliveryType {
  const value = readString(formData, "deliveryType") as DeliveryType;
  return allowedDeliveryTypes.includes(value) ? value : "COURSE_SUMMARY";
}

function readAudience(formData: FormData): string {
  const value = readString(formData, "audience");
  return allowedAudiences.includes(value) ? value : "Collège";
}

function createTitle(sourceContent: string, learningObjective: string): string {
  const base = learningObjective || sourceContent;
  const normalized = base.replace(/\s+/g, " ").trim();
  if (!normalized) return "Projet audio sans titre";
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

export async function createProject(formData: FormData) {
  const sourceContent = readString(formData, "sourceContent");
  const learningObjective = readString(formData, "learningObjective");
  const targetDurationMinutes = readDuration(formData);
  const deliveryType = readDeliveryType(formData);
  const audience = readAudience(formData);
  const tone = readString(formData, "tone") || "Clair et vivant";
  const level = readString(formData, "level") || "Intermediaire";

  if (!sourceContent || !learningObjective) {
    redirect("/projects/new?error=missing-fields");
  }

  const title = createTitle(sourceContent, learningObjective);
  let projectId: string;

  try {
    const result = await getLLMProvider().generateAudioScript({
      title,
      sourceContent,
      targetDurationMinutes,
      audience,
      tone,
      level,
      learningObjective,
      deliveryType,
    });
    const project = await prisma.project.create({
      data: {
        title,
        userId: null,
        sourceContent,
        targetDurationMinutes,
        deliveryType,
        audience,
        tone,
        level,
        learningObjective,
        projectKind: "LEGACY_AUDIO",
        script: result.script,
        scriptStatus: "SCRIPT_GENERATED",
        contentVersion: 1,
        audioStatus: "NOT_GENERATED",
        audioContentVersion: null,
        audioFormat: "mp3",
        errorMessage: null,
      },
    });
    projectId = project.id;
  } catch (error) {
    const project = await prisma.project.create({
      data: {
        title,
        userId: null,
        sourceContent,
        targetDurationMinutes,
        deliveryType,
        audience,
        tone,
        level,
        learningObjective,
        projectKind: "LEGACY_AUDIO",
        scriptStatus: "SCRIPT_FAILED",
        contentVersion: 1,
        audioStatus: "NOT_GENERATED",
        audioContentVersion: null,
        errorMessage:
          error instanceof Error ? error.message : "Erreur inconnue de génération",
      },
    });
    projectId = project.id;
  }

  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

export async function regenerateProjectScript(formData: FormData) {
  const projectId = readString(formData, "projectId");
  if (!projectId) redirect("/projects");

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) redirect("/projects");

  try {
    const result = await getLLMProvider().generateAudioScript({
      title: project.title,
      sourceContent: project.sourceContent,
      targetDurationMinutes: project.targetDurationMinutes,
      audience: project.audience,
      tone: project.tone,
      level: project.level,
      learningObjective: project.learningObjective,
      deliveryType: project.deliveryType,
    });
    await prisma.project.update({
      where: { id: project.id },
      data: {
        script: result.script,
        scriptStatus: "SCRIPT_GENERATED",
        contentVersion: { increment: 1 },
        audioStatus: "NOT_GENERATED",
        audioErrorMessage: null,
        errorMessage: null,
      },
    });
  } catch (error) {
    await prisma.project.update({
      where: { id: project.id },
      data: {
        scriptStatus: "SCRIPT_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Erreur inconnue de régénération",
      },
    });
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);
  redirect(`/projects/${project.id}`);
}

export async function generateProjectAudio(formData: FormData) {
  const projectId = readString(formData, "projectId");
  if (!projectId) redirect("/projects");
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) redirect("/projects");

  const contentVersion = project.contentVersion;
  let script: string;
  try {
    script = validateTTSScript(project.script);
  } catch (error) {
    await prisma.project.updateMany({
      where: { id: project.id, contentVersion },
      data: {
        audioStatus: "FAILED",
        audioErrorMessage: toPublicAudioError(error),
      },
    });
    revalidatePath(`/projects/${project.id}`);
    return;
  }

  const claim = await prisma.project.updateMany({
    where: {
      id: project.id,
      contentVersion,
      audioStatus: { not: "PENDING" },
    },
    data: { audioStatus: "PENDING", audioErrorMessage: null },
  });
  if (claim.count === 0) return;

  try {
    const generation = await generateSegmentedStoredAudio({
      script,
      provider: getTTSProvider(),
      publish: async ({ manifestFileName, durationSeconds }) => {
        const saved = await prisma.project.updateMany({
          where: { id: project.id, contentVersion, audioStatus: "PENDING" },
          data: {
            audioStatus: "GENERATED",
            audioContentVersion: contentVersion,
            audioFilePath: manifestFileName,
            audioUrl: `/api/projects/${project.id}/audio`,
            audioFormat: "mp3",
            audioDurationSeconds: durationSeconds,
            audioGeneratedAt: new Date(),
            audioErrorMessage: null,
          },
        });
        return saved.count > 0;
      },
    });

    if (!generation.published || !generation.manifestFileName) {
      revalidatePath(`/projects/${project.id}`);
      return;
    }

    if (
      project.audioFilePath &&
      project.audioFilePath !== generation.manifestFileName
    ) {
      await removeStoredAudio(project.audioFilePath).catch(() => undefined);
    }
  } catch (error) {
    await prisma.project.updateMany({
      where: { id: project.id, contentVersion },
      data: {
        audioStatus: "FAILED",
        audioErrorMessage: toPublicAudioError(error),
      },
    });
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);
}

export async function deleteProject(formData: FormData) {
  const projectId = readString(formData, "projectId");
  if (!projectId) redirect("/projects");

  const project = await prisma.project.delete({ where: { id: projectId } });
  await removeStoredAudio(project.audioFilePath).catch(() => undefined);
  revalidatePath("/projects");
  redirect("/projects");
}
