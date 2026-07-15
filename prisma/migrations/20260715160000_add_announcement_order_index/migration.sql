-- Index khớp thứ tự sắp xếp của GET /api/announcements (pinned desc, issuedAt desc, createdAt desc).
CREATE INDEX IF NOT EXISTS "Announcement_pinned_issuedAt_createdAt_idx"
ON "Announcement"("pinned", "issuedAt", "createdAt");
