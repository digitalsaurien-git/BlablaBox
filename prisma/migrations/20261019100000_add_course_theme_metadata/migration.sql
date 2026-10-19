-- AddColumn: metadata JSONB on CourseTheme (non-destructive, default '{}')
ALTER TABLE "CourseTheme" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';
