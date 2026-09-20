-- AlterEnum
ALTER TYPE "NotificationEventType" ADD VALUE 'MAILBOX_ISSUE';

-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "weeklyDigestDay" INTEGER NOT NULL DEFAULT 1,
    "weeklyDigestHour" INTEGER NOT NULL DEFAULT 8,
    "weeklyDigestMinute" INTEGER NOT NULL DEFAULT 0,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStart" INTEGER NOT NULL DEFAULT 1140,
    "quietHoursEnd" INTEGER NOT NULL DEFAULT 450,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_userId_key" ON "NotificationSetting"("userId");

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
