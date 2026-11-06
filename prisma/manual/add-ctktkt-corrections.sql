BEGIN;
CREATE TABLE IF NOT EXISTS public.ctktkt_input_ownership (
 operating_date text NOT NULL,field_code text NOT NULL,owner_id text NOT NULL,shift_start timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(operating_date,field_code)
);
CREATE TABLE IF NOT EXISTS public.ctktkt_correction_requests (
 id text PRIMARY KEY,operating_date text NOT NULL,requester_id text NOT NULL,requester_name text NOT NULL,reason text NOT NULL,entries jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),created_at timestamptz NOT NULL DEFAULT now(),reviewer_id text,reviewer_name text,reviewed_at timestamptz,review_note text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ctktkt_corrections_status ON public.ctktkt_correction_requests(status,created_at DESC);
CREATE INDEX IF NOT EXISTS ctktkt_corrections_requester ON public.ctktkt_correction_requests(requester_id,created_at DESC);
COMMIT;
