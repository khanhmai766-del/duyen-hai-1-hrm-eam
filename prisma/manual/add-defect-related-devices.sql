CREATE TABLE IF NOT EXISTS "DefectRelatedDevice" (
  "defectId" TEXT NOT NULL,
  "deviceSeq" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DefectRelatedDevice_pkey" PRIMARY KEY ("defectId", "deviceSeq"),
  CONSTRAINT "DefectRelatedDevice_defectId_fkey"
    FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DefectRelatedDevice_deviceSeq_fkey"
    FOREIGN KEY ("deviceSeq") REFERENCES "EquipmentNode"("seq") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DefectRelatedDevice_deviceSeq_idx"
  ON "DefectRelatedDevice"("deviceSeq");

CREATE TABLE IF NOT EXISTS "DefectHistoryRelatedDevice" (
  "historyId" TEXT NOT NULL,
  "deviceSeq" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DefectHistoryRelatedDevice_pkey" PRIMARY KEY ("historyId", "deviceSeq"),
  CONSTRAINT "DefectHistoryRelatedDevice_historyId_fkey"
    FOREIGN KEY ("historyId") REFERENCES "DefectHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DefectHistoryRelatedDevice_deviceSeq_fkey"
    FOREIGN KEY ("deviceSeq") REFERENCES "EquipmentNode"("seq") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DefectHistoryRelatedDevice_deviceSeq_idx"
  ON "DefectHistoryRelatedDevice"("deviceSeq");
