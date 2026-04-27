/*
  Warnings:

  - A unique constraint covering the columns `[twilioNumber]` on the table `Business` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Business" ADD COLUMN "twilioNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Business_twilioNumber_key" ON "Business"("twilioNumber");
