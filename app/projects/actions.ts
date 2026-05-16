"use server";

import type { DeliveryType } from "@/lib/providers/llm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getLLMProvider } from "@/lib/providers/llm";

const allowedDeliveryTypes: DeliveryType[] = [
  "IMMERSIVE_STORY",
  "COURSE_SUMMARY",
  "MEMORY_AUDIO_CARD",
  "REVIEW_QA",
];

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function readDuration(formData: FormData): number {
  const value = Number(readString(formData, "targetDurationMinutes"));
  const allowed = [3, 5, 10, 15, 20];

  return allowed.includes(value) ? value : 3;
}

function readDeliveryType(formData: FormData): DeliveryType {
  const value = readString(formData, "deliveryType") as DeliveryType;

  return allowedDeliveryTypes.includes(value) ? value : "COURSE_SUMMARY";
}

function createTitle(sourceContent: string, learningObjective: string): string {
  const base = learningObjective || sourceContent;
  const normalized = base.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "Projet audio sans titre";
  }

  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

export async function createProject(formData: FormData) {
  const sourceContent = readString(formData, "sourceContent");
  const learningObjective = readString(formData, "learningObjective");
  const targetDurationMinutes = readDuration(formData);
  const deliveryType = readDeliveryType(formData);
  const audience = readString(formData, "audience") || "Apprenants curieux";
  const tone = readString(formData, "tone") || "Clair et vivant";
  const level = readString(formData, "level") || "Intermediaire";

  if (!sourceContent || !learningObjective) {
    redirect("/projects/new?error=missing-fields");
  }

  const title = createTitle(sourceContent, learningObjective);
  const provider = getLLMProvider();
  let projectId: string;

  try {
    const result = await provider.generateAudioScript({
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
        script: result.script,
        scriptStatus: "SCRIPT_GENERATED",
        audioStatus: "MOCK_READY",
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
        scriptStatus: "SCRIPT_FAILED",
        audioStatus: "NOT_STARTED",
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

  if (!projectId) {
    redirect("/projects");
  }

  const project = await prisma.project.findUnique({
    where: {
      id: projectId,
    },
  });

  if (!project) {
    redirect("/projects");
  }

  const provider = getLLMProvider();

  try {
    const result = await provider.generateAudioScript({
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
      where: {
        id: project.id,
      },
      data: {
        script: result.script,
        scriptStatus: "SCRIPT_GENERATED",
        audioStatus: "MOCK_READY",
        errorMessage: null,
      },
    });
  } catch (error) {
    await prisma.project.update({
      where: {
        id: project.id,
      },
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

export async function deleteProject(formData: FormData) {
  const projectId = readString(formData, "projectId");

  if (!projectId) {
    redirect("/projects");
  }

  await prisma.project.delete({
    where: {
      id: projectId,
    },
  });

  revalidatePath("/projects");
  redirect("/projects");
}