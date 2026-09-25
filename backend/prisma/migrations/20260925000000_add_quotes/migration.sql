-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'CONVERTED');

-- AlterTable
ALTER TABLE "VoiceNote" ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'INVOICE';

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobId" TEXT,
    "quoteNumber" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "laborHours" DOUBLE PRECISION,
    "laborRate" DOUBLE PRECISION,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "convertedInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLineItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PART',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteDelivery" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_jobId_key" ON "Quote"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "Quote"("quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_publicToken_key" ON "Quote"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_convertedInvoiceId_key" ON "Quote"("convertedInvoiceId");

-- CreateIndex
CREATE INDEX "Quote_organizationId_idx" ON "Quote"("organizationId");

-- CreateIndex
CREATE INDEX "Quote_clientId_idx" ON "Quote"("clientId");

-- CreateIndex
CREATE INDEX "QuoteLineItem_quoteId_idx" ON "QuoteLineItem"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteDelivery_quoteId_idx" ON "QuoteDelivery"("quoteId");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDelivery" ADD CONSTRAINT "QuoteDelivery_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
