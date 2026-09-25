-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "reviewRequestEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reviewRequestDelayDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "reviewLinkUrl" TEXT,
ADD COLUMN     "rebookingRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "followUpsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "recurrenceIntervalMonths" INTEGER,
ADD COLUMN     "rebookingReminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "reviewRequestSentAt" TIMESTAMP(3);
