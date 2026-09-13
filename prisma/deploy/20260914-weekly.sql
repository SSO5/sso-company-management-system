-- AlterTable
ALTER TABLE "ProgressReport" ADD COLUMN     "dateVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalSourceDocumentId" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "processingError" TEXT,
ADD COLUMN     "processingStartedAt" TIMESTAMP(3),
ADD COLUMN     "processingState" TEXT NOT NULL DEFAULT 'IDLE',
ADD COLUMN     "progressFormat" TEXT NOT NULL DEFAULT 'UNKNOWN';

-- CreateTable
CREATE TABLE "ProjectWeeklySettings" (
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT,
    "vendorDueAt" TIMESTAMP(3),
    "customerDueAt" TIMESTAMP(3),
    "recipient" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'WhatsApp',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectWeeklySettings_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "ProgressReportReview" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "pdfKey" TEXT NOT NULL,
    "pdfHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "notificationStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',

    CONSTRAINT "ProgressReportReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressReportDispatch" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "recipient" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'MANUAL_CONFIRMATION',
    "note" TEXT,

    CONSTRAINT "ProgressReportDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgressReportReview_approverId_status_idx" ON "ProgressReportReview"("approverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressReportReview_reportId_version_key" ON "ProgressReportReview"("reportId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressReportDispatch_reviewId_key" ON "ProgressReportDispatch"("reviewId");

-- AddForeignKey
ALTER TABLE "ProjectWeeklySettings" ADD CONSTRAINT "ProjectWeeklySettings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReportReview" ADD CONSTRAINT "ProgressReportReview_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ProgressReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReportDispatch" ADD CONSTRAINT "ProgressReportDispatch_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ProgressReportReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
