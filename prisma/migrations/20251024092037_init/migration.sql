-- CreateTable
CREATE TABLE "AuditRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUpn" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dryRun" BOOLEAN NOT NULL,
    "canary" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "changed" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "AuditItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "upn" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    CONSTRAINT "AuditItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AuditRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
