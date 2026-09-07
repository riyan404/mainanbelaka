-- CreateTable
CREATE TABLE "ShiftSchedule" (
    "id" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "cameraChannelId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftSchedule_cameraChannelId_startTime_idx" ON "ShiftSchedule"("cameraChannelId", "startTime");

-- CreateIndex
CREATE INDEX "ShiftSchedule_startTime_endTime_idx" ON "ShiftSchedule"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "ShiftSchedule_staffName_idx" ON "ShiftSchedule"("staffName");

-- AddForeignKey
ALTER TABLE "ShiftSchedule" ADD CONSTRAINT "ShiftSchedule_cameraChannelId_fkey" FOREIGN KEY ("cameraChannelId") REFERENCES "CameraChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
