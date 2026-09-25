-- AlterTable: soft-delete on Project
ALTER TABLE "Project" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable: soft-delete on CourseTheme
ALTER TABLE "CourseTheme" ADD COLUMN "deletedAt" TIMESTAMP(3);
