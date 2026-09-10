-- Chạy một lần sau khi được phép thay đổi cơ sở dữ liệu.
-- Chỉ tạo bốn bảng mới cho sổ PCT, không đổi dữ liệu hiện có.
BEGIN;
-- CreateTable
CREATE TABLE "WorkPermitPerson" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "canCommand" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "searchText" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPermitPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPermitSession" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "commanderId" TEXT NOT NULL,
    "commanderCode" TEXT NOT NULL DEFAULT '',
    "commanderName" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "members" JSONB NOT NULL,
    "workerCount" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "authorizerName" TEXT NOT NULL,
    "endConfirmedByName" TEXT NOT NULL DEFAULT '',
    "endNote" TEXT NOT NULL DEFAULT '',
    "searchText" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "endedById" TEXT,
    "endedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPermitSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPermit" (
    "id" TEXT NOT NULL,
    "workType" TEXT,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "unit" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "workDate" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL DEFAULT '',
    "leaderName" TEXT NOT NULL DEFAULT '',
    "commanderName" TEXT NOT NULL DEFAULT '',
    "teamName" TEXT NOT NULL DEFAULT '',
    "teamType" TEXT NOT NULL DEFAULT 'INTERNAL',
    "members" JSONB NOT NULL DEFAULT '[]',
    "workerCount" INTEGER,
    "authorizerName" TEXT NOT NULL DEFAULT '',
    "issuedAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "result" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "statusReason" TEXT NOT NULL DEFAULT '',
    "repairRequestNumber" TEXT NOT NULL DEFAULT '',
    "searchText" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPermit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPermitHistory" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkPermitHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkPermitPerson_code_key" ON "WorkPermitPerson"("code");

-- CreateIndex
CREATE INDEX "WorkPermitSession_permitId_openedAt_idx" ON "WorkPermitSession"("permitId", "openedAt");

-- CreateIndex
CREATE INDEX "WorkPermitSession_commanderId_openedAt_endedAt_idx" ON "WorkPermitSession"("commanderId", "openedAt", "endedAt");

-- CreateIndex
CREATE INDEX "WorkPermit_kind_workDate_idx" ON "WorkPermit"("kind", "workDate");

-- CreateIndex
CREATE INDEX "WorkPermit_status_workDate_idx" ON "WorkPermit"("status", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "WorkPermit_kind_year_number_key" ON "WorkPermit"("kind", "year", "number");

-- CreateIndex
CREATE INDEX "WorkPermitHistory_permitId_createdAt_idx" ON "WorkPermitHistory"("permitId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkPermitSession" ADD CONSTRAINT "WorkPermitSession_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "WorkPermit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPermitSession" ADD CONSTRAINT "WorkPermitSession_commanderId_fkey" FOREIGN KEY ("commanderId") REFERENCES "WorkPermitPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPermitHistory" ADD CONSTRAINT "WorkPermitHistory_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "WorkPermit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Prisma 5 chưa biểu diễn được chỉ mục duy nhất có điều kiện trong schema.
-- Giữ các chỉ mục này khi tạo SQL cho sổ PCT về sau.
CREATE UNIQUE INDEX "WorkPermitSession_one_open_permit"
  ON "WorkPermitSession" ("permitId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "WorkPermitSession_one_open_commander"
  ON "WorkPermitSession" ("commanderId") WHERE "endedAt" IS NULL;
ALTER TABLE "WorkPermitSession" ADD CONSTRAINT "WorkPermitSession_time_order"
  CHECK ("endedAt" IS NULL OR "endedAt" >= "openedAt");

COMMIT;
