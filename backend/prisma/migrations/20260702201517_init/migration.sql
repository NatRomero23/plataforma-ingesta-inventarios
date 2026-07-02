-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COORDINATOR', 'PHARMACY_USER');

-- CreateEnum
CREATE TYPE "LoadOrigin" AS ENUM ('PORTAL', 'API');

-- CreateEnum
CREATE TYPE "LoadStatus" AS ENUM ('RECEIVED', 'VALIDATED', 'QUEUED', 'SENT', 'CONFIRMED', 'CONFIRMED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "LoadRowStatus" AS ENUM ('VALID', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "DispatchJobStatus" AS ENUM ('QUEUED', 'CLAIMED', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Chain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pharmacy" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "chainInternalCode" TEXT NOT NULL,
    "redVidarPharmacyCode" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pharmacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "chainId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Load" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "origin" "LoadOrigin" NOT NULL,
    "uploaderUserId" TEXT,
    "apiKeyId" TEXT,
    "sourceLabel" TEXT,
    "status" "LoadStatus" NOT NULL DEFAULT 'RECEIVED',
    "idempotencyKey" TEXT,
    "originalBlob" BYTEA NOT NULL,
    "originalFilename" TEXT,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "unmappedPharmacyCount" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Load_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadRow" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "chainPharmacyCode" TEXT NOT NULL,
    "redVidarPharmacyCode" TEXT,
    "ean" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "stock" INTEGER NOT NULL,
    "status" "LoadRowStatus" NOT NULL,
    "rejectionReason" TEXT,

    CONSTRAINT "LoadRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchAttempt" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "httpStatus" INTEGER,
    "webhookEventId" TEXT,
    "outcome" TEXT NOT NULL,
    "retryAfterMs" INTEGER,
    "errorReason" TEXT,

    CONSTRAINT "DispatchAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedVidarResult" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "webhookEventId" TEXT NOT NULL,
    "processingStatus" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "entriesInserted" INTEGER,
    "medicationsInserted" INTEGER,
    "medicationsUpdated" INTEGER,
    "unknownPharmacyCodes" TEXT[],
    "rowErrors" JSONB NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedVidarResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchJob" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "status" "DispatchJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'INDEFINITE',
    "afterDays" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Chain_name_key" ON "Chain"("name");

-- CreateIndex
CREATE INDEX "Pharmacy_chainId_idx" ON "Pharmacy"("chainId");

-- CreateIndex
CREATE INDEX "Pharmacy_redVidarPharmacyCode_idx" ON "Pharmacy"("redVidarPharmacyCode");

-- CreateIndex
CREATE UNIQUE INDEX "Pharmacy_chainId_chainInternalCode_key" ON "Pharmacy"("chainId", "chainInternalCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ApiKey_chainId_status_idx" ON "ApiKey"("chainId", "status");

-- CreateIndex
CREATE INDEX "Load_chainId_createdAt_idx" ON "Load"("chainId", "createdAt");

-- CreateIndex
CREATE INDEX "Load_status_idx" ON "Load"("status");

-- CreateIndex
CREATE INDEX "LoadRow_loadId_idx" ON "LoadRow"("loadId");

-- CreateIndex
CREATE INDEX "DispatchAttempt_loadId_idx" ON "DispatchAttempt"("loadId");

-- CreateIndex
CREATE UNIQUE INDEX "RedVidarResult_loadId_key" ON "RedVidarResult"("loadId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchJob_loadId_key" ON "DispatchJob"("loadId");

-- CreateIndex
CREATE INDEX "DispatchJob_status_availableAt_idx" ON "DispatchJob"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "Pharmacy" ADD CONSTRAINT "Pharmacy_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadRow" ADD CONSTRAINT "LoadRow_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchAttempt" ADD CONSTRAINT "DispatchAttempt_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedVidarResult" ADD CONSTRAINT "RedVidarResult_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índice único PARCIAL: el código Red Vidar (pharmacyCode) debe ser único donde no es nulo.
-- Prisma no expresa índices únicos parciales en el schema; se añade aquí manualmente (data-model.md).
CREATE UNIQUE INDEX "Pharmacy_redVidarPharmacyCode_partial_key" ON "Pharmacy"("redVidarPharmacyCode") WHERE "redVidarPharmacyCode" IS NOT NULL;
