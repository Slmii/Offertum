-- CreateEnum
CREATE TYPE "AICallStatus" AS ENUM ('SUCCESS', 'FAILED', 'SCHEMA_INVALID', 'TIMEOUT');

-- CreateTable
CREATE TABLE "AICall" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT,
    "parsed" JSONB,
    "status" "AICallStatus" NOT NULL,
    "errorMessage" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "requestId" TEXT,
    "userId" UUID,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AICall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AICall_organizationId_createdAt_idx" ON "AICall"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AICall_purpose_status_createdAt_idx" ON "AICall"("purpose", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AICall_requestId_idx" ON "AICall"("requestId");
