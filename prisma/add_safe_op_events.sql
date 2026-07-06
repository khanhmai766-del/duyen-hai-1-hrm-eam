CREATE TABLE IF NOT EXISTS "SafeOperationEvent" (
    "id" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT,
    "isAdded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafeOperationEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SafeOperationEvent"
    ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL,
    ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL,
    ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3) NOT NULL,
    ADD COLUMN IF NOT EXISTS "endedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "reason" TEXT,
    ADD COLUMN IF NOT EXISTS "isAdded" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "unit"
            ORDER BY "createdAt" DESC, "startedAt" DESC, "id" DESC
        ) AS rn
    FROM "SafeOperationEvent"
    WHERE "category" = 'continuous'
)
DELETE FROM "SafeOperationEvent"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

DELETE FROM "SafeOperationEvent"
WHERE "unit" NOT IN ('S1', 'S2')
   OR "category" NOT IN ('continuous', 'standby', 'maintenance', 'incident')
   OR ("category" = 'continuous' AND "endedAt" IS NOT NULL)
   OR ("category" <> 'continuous' AND ("endedAt" IS NULL OR "endedAt" <= "startedAt"));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SafeOperationEvent_unit_check'
    ) THEN
        ALTER TABLE "SafeOperationEvent"
            ADD CONSTRAINT "SafeOperationEvent_unit_check"
            CHECK ("unit" IN ('S1', 'S2'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SafeOperationEvent_category_check'
    ) THEN
        ALTER TABLE "SafeOperationEvent"
            ADD CONSTRAINT "SafeOperationEvent_category_check"
            CHECK ("category" IN ('continuous', 'standby', 'maintenance', 'incident'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SafeOperationEvent_period_check'
    ) THEN
        ALTER TABLE "SafeOperationEvent"
            ADD CONSTRAINT "SafeOperationEvent_period_check"
            CHECK (
                ("category" = 'continuous' AND "endedAt" IS NULL)
                OR
                ("category" <> 'continuous' AND "endedAt" IS NOT NULL AND "endedAt" > "startedAt")
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SafeOperationEvent_unit_category_idx" ON "SafeOperationEvent"("unit", "category");
CREATE INDEX IF NOT EXISTS "SafeOperationEvent_createdAt_idx" ON "SafeOperationEvent"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "SafeOperationEvent_one_continuous_per_unit"
    ON "SafeOperationEvent"("unit")
    WHERE "category" = 'continuous';
