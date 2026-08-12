CREATE TYPE "DeviceType" AS ENUM ('IP_CAMERA', 'NVR', 'DVR');
CREATE TYPE "ConnectionStatus" AS ENUM ('UNTESTED', 'ONLINE', 'OFFLINE', 'ERROR');
CREATE TYPE "Availability" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

CREATE TABLE "Admin" ("id" TEXT PRIMARY KEY, "username" TEXT NOT NULL UNIQUE, "passwordHash" TEXT NOT NULL, "lastLoginAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "Device" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "type" "DeviceType" NOT NULL, "host" TEXT NOT NULL, "httpPort" INTEGER NOT NULL DEFAULT 80, "rtspPort" INTEGER NOT NULL DEFAULT 554, "usernameEncrypted" TEXT NOT NULL, "passwordEncrypted" TEXT NOT NULL, "manufacturer" TEXT, "model" TEXT, "serialNumber" TEXT, "firmwareVersion" TEXT, "connectionStatus" "ConnectionStatus" NOT NULL DEFAULT 'UNTESTED', "lastCheckedAt" TIMESTAMP(3), "archivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE UNIQUE INDEX "Device_host_httpPort_key" ON "Device"("host", "httpPort");
CREATE INDEX "Device_archivedAt_idx" ON "Device"("archivedAt");
CREATE TABLE "CameraChannel" ("id" TEXT PRIMARY KEY, "deviceId" TEXT NOT NULL REFERENCES "Device"("id") ON DELETE CASCADE, "channelNumber" INTEGER NOT NULL, "name" TEXT NOT NULL, "location" TEXT, "mainStreamPath" TEXT NOT NULL, "subStreamPath" TEXT NOT NULL, "mainCodec" TEXT, "subCodec" TEXT, "mainResolution" TEXT, "subResolution" TEXT, "mainFps" DOUBLE PRECISION, "subFps" DOUBLE PRECISION, "enabled" BOOLEAN NOT NULL DEFAULT false, "availability" "Availability" NOT NULL DEFAULT 'AVAILABLE', "connectionStatus" "ConnectionStatus" NOT NULL DEFAULT 'UNTESTED', "lastTestedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE UNIQUE INDEX "CameraChannel_deviceId_channelNumber_key" ON "CameraChannel"("deviceId", "channelNumber");
CREATE INDEX "CameraChannel_enabled_availability_idx" ON "CameraChannel"("enabled", "availability");
CREATE TABLE "Group" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL UNIQUE, "description" TEXT, "isDefault" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "CameraGroup" ("cameraChannelId" TEXT NOT NULL REFERENCES "CameraChannel"("id") ON DELETE CASCADE, "groupId" TEXT NOT NULL REFERENCES "Group"("id") ON DELETE CASCADE, PRIMARY KEY ("cameraChannelId", "groupId"));
