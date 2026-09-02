-- CreateEnum
CREATE TYPE "Posture" AS ENUM ('SITTING', 'STANDING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('IDLE', 'RUNNING', 'ERROR');

-- DropForeignKey
ALTER TABLE "CameraChannel" DROP CONSTRAINT "CameraChannel_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "CameraGroup" DROP CONSTRAINT "CameraGroup_cameraChannelId_fkey";

-- DropForeignKey
ALTER TABLE "CameraGroup" DROP CONSTRAINT "CameraGroup_groupId_fkey";

-- CreateTable
CREATE TABLE "AnalyticsZone" (
    "id" TEXT NOT NULL,
    "cameraChannelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "polygon" JSONB NOT NULL,
    "trackPosture" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DwellEvent" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "trackRef" TEXT NOT NULL,
    "posture" "Posture",
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "exitedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DwellEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsModuleStatus" (
    "id" TEXT NOT NULL,
    "cameraChannelId" TEXT NOT NULL,
    "analyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sampleIntervalMs" INTEGER NOT NULL DEFAULT 1000,
    "lastEventAt" TIMESTAMP(3),
    "workerStatus" "WorkerStatus" NOT NULL DEFAULT 'IDLE',
    "lastErrorMessage" TEXT,
    "snapshotPath" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsModuleStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsZone_cameraChannelId_enabled_idx" ON "AnalyticsZone"("cameraChannelId", "enabled");

-- CreateIndex
CREATE INDEX "DwellEvent_zoneId_enteredAt_idx" ON "DwellEvent"("zoneId", "enteredAt");

-- CreateIndex
CREATE INDEX "DwellEvent_enteredAt_idx" ON "DwellEvent"("enteredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsModuleStatus_cameraChannelId_key" ON "AnalyticsModuleStatus"("cameraChannelId");

-- AddForeignKey
ALTER TABLE "CameraChannel" ADD CONSTRAINT "CameraChannel_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraGroup" ADD CONSTRAINT "CameraGroup_cameraChannelId_fkey" FOREIGN KEY ("cameraChannelId") REFERENCES "CameraChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraGroup" ADD CONSTRAINT "CameraGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsZone" ADD CONSTRAINT "AnalyticsZone_cameraChannelId_fkey" FOREIGN KEY ("cameraChannelId") REFERENCES "CameraChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DwellEvent" ADD CONSTRAINT "DwellEvent_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "AnalyticsZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsModuleStatus" ADD CONSTRAINT "AnalyticsModuleStatus_cameraChannelId_fkey" FOREIGN KEY ("cameraChannelId") REFERENCES "CameraChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
