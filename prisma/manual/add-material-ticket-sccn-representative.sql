ALTER TABLE "MaterialTicket"
  ADD COLUMN IF NOT EXISTS "sccnRepresentativeName" TEXT,
  ADD COLUMN IF NOT EXISTS "sccnRepresentativePosition" TEXT;
