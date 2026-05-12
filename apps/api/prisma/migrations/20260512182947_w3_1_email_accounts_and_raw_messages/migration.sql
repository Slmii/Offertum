-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('GMAIL', 'MICROSOFT');

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "provider" "EmailProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "historyId" TEXT,
    "watchExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawMessage" (
    "id" UUID NOT NULL,
    "emailAccountId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "threadId" TEXT,
    "internalDate" TIMESTAMP(3) NOT NULL,
    "subject" TEXT,
    "fromEmail" TEXT,
    "fromName" TEXT,
    "raw" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isQuoteRequest" BOOLEAN,
    "classifiedAt" TIMESTAMP(3),

    CONSTRAINT "RawMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailAccount_organizationId_idx" ON "EmailAccount"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_organizationId_provider_providerAccountId_key" ON "EmailAccount"("organizationId", "provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "RawMessage_organizationId_internalDate_idx" ON "RawMessage"("organizationId", "internalDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RawMessage_emailAccountId_providerMessageId_key" ON "RawMessage"("emailAccountId", "providerMessageId");

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMessage" ADD CONSTRAINT "RawMessage_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
