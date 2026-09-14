CREATE TABLE "FinanceWorkItem" (
 "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'BILLING', "projectId" TEXT, "reference" TEXT, "ownerId" TEXT, "dueAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'OPEN', "checks" JSONB NOT NULL, "notes" TEXT, "createdById" TEXT NOT NULL, "updatedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "FinanceWorkItem_status_dueAt_idx" ON "FinanceWorkItem"("status", "dueAt");
CREATE TABLE "FinanceBankBalance" (
 "id" TEXT PRIMARY KEY, "bankName" TEXT NOT NULL, "asOf" TIMESTAMP(3) NOT NULL, "amount" DECIMAL(18,2) NOT NULL, "sourceDocumentId" TEXT NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FinanceBankBalance_bankName_asOf_idx" ON "FinanceBankBalance"("bankName", "asOf");
CREATE TABLE "FinanceProjectEstimate" (
 "projectId" TEXT PRIMARY KEY, "netSales" DECIMAL(18,2) NOT NULL, "totalForecastCost" DECIMAL(18,2) NOT NULL, "basis" TEXT NOT NULL, "updatedById" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
);
