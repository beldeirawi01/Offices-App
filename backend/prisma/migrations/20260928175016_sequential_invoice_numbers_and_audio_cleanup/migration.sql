-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "invoiceSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quoteSequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VoiceNote" ADD COLUMN     "audioDeleted" BOOLEAN NOT NULL DEFAULT false;
