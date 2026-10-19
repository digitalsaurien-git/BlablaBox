-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "Homework" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "subjectLabel" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "courseThemeId" TEXT,
    "courseUnresolved" BOOLEAN NOT NULL DEFAULT false,
    "status" "HomeworkStatus" NOT NULL DEFAULT 'TODO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Homework_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Homework_id_userId_key" ON "Homework"("id", "userId");

-- CreateIndex
CREATE INDEX "Homework_userId_dueDate_idx" ON "Homework"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "Homework_userId_status_idx" ON "Homework"("userId", "status");

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_courseThemeId_userId_fkey" FOREIGN KEY ("courseThemeId", "userId") REFERENCES "CourseTheme"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;
