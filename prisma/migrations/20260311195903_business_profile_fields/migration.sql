-- AlterTable
ALTER TABLE "Business" ADD COLUMN "address" TEXT;
ALTER TABLE "Business" ADD COLUMN "city" TEXT;
ALTER TABLE "Business" ADD COLUMN "country" TEXT;

-- AlterTable
ALTER TABLE "Call" ADD COLUMN "twilioSid" TEXT;
