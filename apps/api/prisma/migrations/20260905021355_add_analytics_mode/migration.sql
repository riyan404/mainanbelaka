-- CreateEnum
CREATE TYPE "AnalyticsMode" AS ENUM ('POSE', 'FACE');

-- AlterTable
ALTER TABLE "AnalyticsModuleStatus" ADD COLUMN     "analyticsMode" "AnalyticsMode" NOT NULL DEFAULT 'POSE';
