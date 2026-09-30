-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "quickbooksCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "quickbooksInvoiceId" TEXT,
ADD COLUMN     "quickbooksPaymentId" TEXT,
ADD COLUMN     "quickbooksSyncError" TEXT,
ADD COLUMN     "quickbooksSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "quickbooksAccessToken" TEXT,
ADD COLUMN     "quickbooksConnectedAt" TIMESTAMP(3),
ADD COLUMN     "quickbooksRealmId" TEXT,
ADD COLUMN     "quickbooksRefreshToken" TEXT,
ADD COLUMN     "quickbooksTokenExpiresAt" TIMESTAMP(3);
