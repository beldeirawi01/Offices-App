-- CreateEnum
CREATE TYPE "DocumentationStage" AS ENUM ('ARRIVAL', 'MID_JOB', 'COMPLETION');

-- CreateTable
CREATE TABLE "JobDocumentation" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stage" "DocumentationStage" NOT NULL,
    "photoStorageKey" TEXT NOT NULL,
    "audioStorageKey" TEXT,
    "transcript" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "clientFacing" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobDocumentation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobDocumentation_jobId_idx" ON "JobDocumentation"("jobId");

-- AddForeignKey
ALTER TABLE "JobDocumentation" ADD CONSTRAINT "JobDocumentation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
