CREATE TYPE "AudioStatus_new" AS ENUM ('NOT_GENERATED', 'PENDING', 'GENERATED', 'FAILED');

ALTER TABLE "Project" ALTER COLUMN "audioStatus" DROP DEFAULT;
ALTER TABLE "Project"
  ALTER COLUMN "audioStatus" TYPE "AudioStatus_new"
  USING (
    CASE "audioStatus"::text
      WHEN 'NOT_STARTED' THEN 'NOT_GENERATED'
      WHEN 'MOCK_READY' THEN 'NOT_GENERATED'
      ELSE "audioStatus"::text
    END
  )::"AudioStatus_new";

DROP TYPE "AudioStatus";
ALTER TYPE "AudioStatus_new" RENAME TO "AudioStatus";
ALTER TABLE "Project" ALTER COLUMN "audioStatus" SET DEFAULT 'NOT_GENERATED';

ALTER TABLE "Project"
  ADD COLUMN "audioFilePath" TEXT,
  ADD COLUMN "audioDurationSeconds" INTEGER,
  ADD COLUMN "audioGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "audioErrorMessage" TEXT;
