-- CreateEnum
CREATE TYPE "PricingCompileStatus" AS ENUM ('IDLE', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "PricingPlaybook" ADD COLUMN     "compileError" TEXT,
ADD COLUMN     "compileStatus" "PricingCompileStatus" NOT NULL DEFAULT 'IDLE';
