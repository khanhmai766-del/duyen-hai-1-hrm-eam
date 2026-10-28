-- Quản lý công việc (nhóm QUẢN LÝ NGƯỜI DÙNG): bảng công việc + người chủ trì.
-- Chỉ tạo bảng mới, không đụng dữ liệu có sẵn. Chạy lại nhiều lần vẫn an toàn.
CREATE TABLE IF NOT EXISTS "WorkTask" (
  "id" TEXT NOT NULL,
  "taskDate" DATE NOT NULL,
  "content" TEXT NOT NULL,
  "director" TEXT NOT NULL,
  "dueDate" DATE,
  "report" TEXT,
  "reportUpdatedAt" TIMESTAMP(3),
  "reportUpdatedById" TEXT,
  "note" TEXT,
  "links" JSONB NOT NULL DEFAULT '[]',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkTask_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WorkTask_taskDate_idx" ON "WorkTask" ("taskDate");
CREATE INDEX IF NOT EXISTS "WorkTask_createdById_idx" ON "WorkTask" ("createdById");

CREATE TABLE IF NOT EXISTS "WorkTaskAssignee" (
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "WorkTaskAssignee_pkey" PRIMARY KEY ("taskId", "userId"),
  CONSTRAINT "WorkTaskAssignee_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkTaskAssignee_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WorkTaskAssignee_userId_idx" ON "WorkTaskAssignee" ("userId");
