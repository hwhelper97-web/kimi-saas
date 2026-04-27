/*
  Warnings:

  - You are about to drop the column `aiGreeting` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `aiLanguage` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `aiOrderStyle` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `aiVoice` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `businessHours` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `twilioNumber` on the `Business` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'restaurant',
    "phoneNumber" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "Business_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("address", "city", "country", "id", "name", "phoneNumber", "tenantId") SELECT "address", "city", "country", "id", "name", "phoneNumber", "tenantId" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
