-- CreateEnum
CREATE TYPE "ChangeOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signatureImage" TEXT NOT NULL,
    "ipAddress" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quoteId" TEXT,
    "changeOrderId" TEXT,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "ChangeOrderStatus" NOT NULL DEFAULT 'PENDING',
    "publicToken" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Signature_quoteId_key" ON "Signature"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Signature_changeOrderId_key" ON "Signature"("changeOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrder_publicToken_key" ON "ChangeOrder"("publicToken");

-- CreateIndex
CREATE INDEX "ChangeOrder_organizationId_idx" ON "ChangeOrder"("organizationId");

-- CreateIndex
CREATE INDEX "ChangeOrder_jobId_idx" ON "ChangeOrder"("jobId");

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
