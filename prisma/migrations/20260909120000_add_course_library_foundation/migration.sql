CREATE TYPE "CoursePartState" AS ENUM ('NORMAL', 'DOCUMENT_EXPECTED');

CREATE TABLE "SchoolYear" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" VARCHAR(80) NOT NULL,
  "startYear" INTEGER,
  "endYear" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolYear_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subject" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "schoolYearId" TEXT NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseTheme" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "orderVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseTheme_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Chapter" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "courseThemeId" TEXT NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoursePart" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "courseThemeId" TEXT NOT NULL,
  "chapterId" TEXT,
  "title" VARCHAR(180) NOT NULL,
  "referenceLabel" VARCHAR(80),
  "sortSegments" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "position" INTEGER NOT NULL,
  "state" "CoursePartState" NOT NULL DEFAULT 'NORMAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoursePart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SourceAsset" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "storageKey" VARCHAR(100) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SourceImport" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceAssetId" TEXT NOT NULL,
  "originalFileName" VARCHAR(255) NOT NULL,
  "declaredMimeType" VARCHAR(100),
  "wasDuplicate" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SourcePlacement" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "coursePartId" TEXT NOT NULL,
  "sourceAssetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourcePlacement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolYear_id_userId_key" ON "SchoolYear"("id", "userId");
CREATE UNIQUE INDEX "SchoolYear_userId_label_key" ON "SchoolYear"("userId", "label");
CREATE INDEX "SchoolYear_userId_idx" ON "SchoolYear"("userId");

CREATE UNIQUE INDEX "Subject_id_userId_key" ON "Subject"("id", "userId");
CREATE UNIQUE INDEX "Subject_userId_schoolYearId_title_key" ON "Subject"("userId", "schoolYearId", "title");
CREATE INDEX "Subject_userId_schoolYearId_idx" ON "Subject"("userId", "schoolYearId");

CREATE UNIQUE INDEX "CourseTheme_id_userId_key" ON "CourseTheme"("id", "userId");
CREATE UNIQUE INDEX "CourseTheme_userId_subjectId_title_key" ON "CourseTheme"("userId", "subjectId", "title");
CREATE INDEX "CourseTheme_userId_subjectId_idx" ON "CourseTheme"("userId", "subjectId");

CREATE UNIQUE INDEX "Chapter_id_userId_key" ON "Chapter"("id", "userId");
CREATE UNIQUE INDEX "Chapter_id_userId_courseThemeId_key" ON "Chapter"("id", "userId", "courseThemeId");
CREATE UNIQUE INDEX "Chapter_userId_courseThemeId_title_key" ON "Chapter"("userId", "courseThemeId", "title");
CREATE INDEX "Chapter_userId_courseThemeId_idx" ON "Chapter"("userId", "courseThemeId");

CREATE UNIQUE INDEX "CoursePart_id_userId_key" ON "CoursePart"("id", "userId");
CREATE INDEX "CoursePart_userId_courseThemeId_position_idx" ON "CoursePart"("userId", "courseThemeId", "position");
CREATE INDEX "CoursePart_userId_chapterId_idx" ON "CoursePart"("userId", "chapterId");

CREATE UNIQUE INDEX "SourceAsset_id_userId_key" ON "SourceAsset"("id", "userId");
CREATE UNIQUE INDEX "SourceAsset_storageKey_key" ON "SourceAsset"("storageKey");
CREATE UNIQUE INDEX "SourceAsset_userId_sha256_key" ON "SourceAsset"("userId", "sha256");
CREATE INDEX "SourceAsset_userId_idx" ON "SourceAsset"("userId");

CREATE INDEX "SourceImport_userId_sourceAssetId_idx" ON "SourceImport"("userId", "sourceAssetId");
CREATE INDEX "SourceImport_userId_createdAt_idx" ON "SourceImport"("userId", "createdAt");
CREATE UNIQUE INDEX "SourcePlacement_coursePartId_sourceAssetId_key" ON "SourcePlacement"("coursePartId", "sourceAssetId");
CREATE INDEX "SourcePlacement_userId_coursePartId_idx" ON "SourcePlacement"("userId", "coursePartId");
CREATE INDEX "SourcePlacement_userId_sourceAssetId_idx" ON "SourcePlacement"("userId", "sourceAssetId");

ALTER TABLE "SchoolYear" ADD CONSTRAINT "SchoolYear_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolYearId_userId_fkey"
  FOREIGN KEY ("schoolYearId", "userId") REFERENCES "SchoolYear"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseTheme" ADD CONSTRAINT "CourseTheme_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseTheme" ADD CONSTRAINT "CourseTheme_subjectId_userId_fkey"
  FOREIGN KEY ("subjectId", "userId") REFERENCES "Subject"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_courseThemeId_userId_fkey"
  FOREIGN KEY ("courseThemeId", "userId") REFERENCES "CourseTheme"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoursePart" ADD CONSTRAINT "CoursePart_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoursePart" ADD CONSTRAINT "CoursePart_courseThemeId_userId_fkey"
  FOREIGN KEY ("courseThemeId", "userId") REFERENCES "CourseTheme"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoursePart" ADD CONSTRAINT "CoursePart_chapterId_userId_courseThemeId_fkey"
  FOREIGN KEY ("chapterId", "userId", "courseThemeId") REFERENCES "Chapter"("id", "userId", "courseThemeId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "SourceAsset" ADD CONSTRAINT "SourceAsset_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceImport" ADD CONSTRAINT "SourceImport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceImport" ADD CONSTRAINT "SourceImport_sourceAssetId_userId_fkey"
  FOREIGN KEY ("sourceAssetId", "userId") REFERENCES "SourceAsset"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourcePlacement" ADD CONSTRAINT "SourcePlacement_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourcePlacement" ADD CONSTRAINT "SourcePlacement_coursePartId_userId_fkey"
  FOREIGN KEY ("coursePartId", "userId") REFERENCES "CoursePart"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourcePlacement" ADD CONSTRAINT "SourcePlacement_sourceAssetId_userId_fkey"
  FOREIGN KEY ("sourceAssetId", "userId") REFERENCES "SourceAsset"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
