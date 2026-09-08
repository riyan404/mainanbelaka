-- AlterTable
ALTER TABLE "ShiftSchedule" ADD COLUMN     "zoneId" TEXT;

-- AddForeignKey
ALTER TABLE "ShiftSchedule" ADD CONSTRAINT "ShiftSchedule_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "AnalyticsZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
