-- AlterEnum
ALTER TYPE "ProjectKind" ADD VALUE 'COURSE_LEARNING';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "courseThemeId" TEXT;

-- CreateTable
CREATE TABLE "SourceExtraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "unitKey" VARCHAR(100) NOT NULL,
    "inputHash" CHAR(64) NOT NULL,
    "extractorVersion" VARCHAR(80) NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "quality" VARCHAR(20) NOT NULL,
    "text" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcePassage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "quality" VARCHAR(20) NOT NULL,

    CONSTRAINT "SourcePassage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectVersion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "courseThemeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "mode" VARCHAR(30) NOT NULL,
    "sourceFingerprint" CHAR(64) NOT NULL,
    "cacheKey" CHAR(64) NOT NULL,
    "content" JSONB NOT NULL,
    "audio" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassageCitation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectVersionId" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "elementKey" VARCHAR(100) NOT NULL,
    "quote" TEXT NOT NULL,

    CONSTRAINT "PassageCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseThemeId" TEXT NOT NULL,
    "projectVersionId" TEXT NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "instruction" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "correctionRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "answer" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "correct" BOOLEAN,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operationKey" CHAR(64) NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "operation" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "units" INTEGER NOT NULL DEFAULT 1,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceExtraction_id_userId_key" ON "SourceExtraction"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceExtraction_userId_sourceAssetId_unitKey_inputHash_ext_key" ON "SourceExtraction"("userId", "sourceAssetId", "unitKey", "inputHash", "extractorVersion", "method");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePassage_id_userId_key" ON "SourcePassage"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePassage_extractionId_position_key" ON "SourcePassage"("extractionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVersion_id_userId_key" ON "ProjectVersion"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVersion_projectId_version_key" ON "ProjectVersion"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVersion_userId_cacheKey_key" ON "ProjectVersion"("userId", "cacheKey");

-- CreateIndex
CREATE UNIQUE INDEX "PassageCitation_projectVersionId_elementKey_passageId_key" ON "PassageCitation"("projectVersionId", "elementKey", "passageId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningSession_id_userId_key" ON "LearningSession"("id", "userId");

-- CreateIndex
CREATE INDEX "LearningAttempt_userId_sessionId_questionIndex_idx" ON "LearningAttempt"("userId", "sessionId", "questionIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderUsage_userId_operationKey_key" ON "ProviderUsage"("userId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "Project_id_userId_key" ON "Project"("id", "userId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_courseThemeId_userId_fkey" FOREIGN KEY ("courseThemeId", "userId") REFERENCES "CourseTheme"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceExtraction" ADD CONSTRAINT "SourceExtraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceExtraction" ADD CONSTRAINT "SourceExtraction_sourceAssetId_userId_fkey" FOREIGN KEY ("sourceAssetId", "userId") REFERENCES "SourceAsset"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePassage" ADD CONSTRAINT "SourcePassage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePassage" ADD CONSTRAINT "SourcePassage_extractionId_userId_fkey" FOREIGN KEY ("extractionId", "userId") REFERENCES "SourceExtraction"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "Project"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_courseThemeId_userId_fkey" FOREIGN KEY ("courseThemeId", "userId") REFERENCES "CourseTheme"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassageCitation" ADD CONSTRAINT "PassageCitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassageCitation" ADD CONSTRAINT "PassageCitation_projectVersionId_userId_fkey" FOREIGN KEY ("projectVersionId", "userId") REFERENCES "ProjectVersion"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassageCitation" ADD CONSTRAINT "PassageCitation_passageId_userId_fkey" FOREIGN KEY ("passageId", "userId") REFERENCES "SourcePassage"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_courseThemeId_userId_fkey" FOREIGN KEY ("courseThemeId", "userId") REFERENCES "CourseTheme"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_projectVersionId_userId_fkey" FOREIGN KEY ("projectVersionId", "userId") REFERENCES "ProjectVersion"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningAttempt" ADD CONSTRAINT "LearningAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningAttempt" ADD CONSTRAINT "LearningAttempt_sessionId_userId_fkey" FOREIGN KEY ("sessionId", "userId") REFERENCES "LearningSession"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUsage" ADD CONSTRAINT "ProviderUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
