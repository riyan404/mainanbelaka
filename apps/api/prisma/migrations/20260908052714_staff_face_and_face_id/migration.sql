-- AlterEnum
ALTER TYPE "AnalyticsMode" ADD VALUE 'FACE_ID';

-- AlterTable
ALTER TABLE "DwellEvent" ADD COLUMN     "staffName" TEXT;

-- CreateTable
CREATE TABLE "StaffFace" (
    "id" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "photoPath" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffFace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "StaffFace_staffName_idx" ON "StaffFace"("staffName");

-- CreateIndex
CREATE INDEX "DwellEvent_staffName_enteredAt_idx" ON "DwellEvent"("staffName", "enteredAt");
