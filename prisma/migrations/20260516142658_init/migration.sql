-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'SCRIPT_GENERATED', 'SCRIPT_FAILED');

-- CreateEnum
CREATE TYPE "AudioStatus" AS ENUM ('NOT_STARTED', 'MOCK_READY', 'PENDING', 'GENERATED', 'FAILED');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'text',
    "sourceContent" TEXT NOT NULL,
    "targetDurationMinutes" INTEGER NOT NULL,
    "audience" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "learningObjective" TEXT NOT NULL,
    "script" TEXT,
    "scriptStatus" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "audioStatus" "AudioStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "audioUrl" TEXT,
    "audioFormat" TEXT DEFAULT 'mp3',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");
