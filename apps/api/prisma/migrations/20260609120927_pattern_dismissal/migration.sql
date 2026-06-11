-- CreateTable
CREATE TABLE "PatternDismissal" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "patternKey" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatternDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatternDismissal_userId_organizationId_idx" ON "PatternDismissal"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PatternDismissal_organizationId_userId_patternKey_key" ON "PatternDismissal"("organizationId", "userId", "patternKey");

-- AddForeignKey
ALTER TABLE "PatternDismissal" ADD CONSTRAINT "PatternDismissal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatternDismissal" ADD CONSTRAINT "PatternDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
