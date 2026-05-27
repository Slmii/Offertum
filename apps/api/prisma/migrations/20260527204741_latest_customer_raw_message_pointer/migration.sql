/*
  Warnings:

  - A unique constraint covering the columns `[latestCustomerRawMessageId]` on the table `Opportunity` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "latestCustomerRawMessageId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_latestCustomerRawMessageId_key" ON "Opportunity"("latestCustomerRawMessageId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_latestCustomerRawMessageId_fkey" FOREIGN KEY ("latestCustomerRawMessageId") REFERENCES "RawMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
