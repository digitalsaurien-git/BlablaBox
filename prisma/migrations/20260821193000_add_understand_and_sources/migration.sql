-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM (
  'LEGACY_AUDIO',
  'UNDERSTAND_LISTEN',
  'DICTATE_WRITE'
);

-- CreateEnum
CREATE TYPE "ResponseMode" AS ENUM (
  'EXPLAIN',
  'STORY',
  'REVIEW',
  'QUICK'
);

-- CreateEnum
CREATE TYPE "VocabularyLevel" AS ENUM (
  'VERY_SIMPLE',
  'COMMON',
  'PRECISE'
);

-- CreateEnum
CREATE TYPE "AdaptationMode" AS ENUM (
  'STANDARD',
  'FOCUS',
  'EASY_READING',
  'MEMORY'
);

-- CreateEnum
CREATE TYPE "ResearchMode" AS ENUM (
  'NONE',
  'AUTO',
  'REQUIRED'
);

-- AlterTable
ALTER TABLE "Project"
  ADD COLUMN "projectKind" "ProjectKind" NOT NULL DEFAULT 'LEGACY_AUDIO',
  ADD COLUMN "responseMode" "ResponseMode",
  ADD COLUMN "vocabularyLevel" "VocabularyLevel" NOT NULL DEFAULT 'COMMON',
  ADD COLUMN "adaptationMode" "AdaptationMode" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "researchMode" "ResearchMode" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "researchUsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "audioContentVersion" INTEGER;

-- CreateTable
CREATE TABLE "ProjectSource" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT,
  "domain" TEXT,
  "sourceOrder" INTEGER NOT NULL,
  "citationStart" INTEGER,
  "citationEnd" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSource_projectId_sourceOrder_key"
  ON "ProjectSource"("projectId", "sourceOrder");

-- CreateIndex
CREATE INDEX "ProjectSource_projectId_idx"
  ON "ProjectSource"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectSource"
  ADD CONSTRAINT "ProjectSource_projectId_fkey"
  FOREIGN KEY ("projectId")
  REFERENCES "Project"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
