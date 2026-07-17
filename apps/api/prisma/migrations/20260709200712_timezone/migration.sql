-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'nl',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Amsterdam';
