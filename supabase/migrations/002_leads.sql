-- ============================================================
-- Migration: 002_leads.sql
-- Description: Leads table for Aviv Iasso Law Office
--              consultation request form submissions
-- ============================================================

-- ── Enable required extensions ─────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enum types ──────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE practice_area_subject AS ENUM (
    'real_estate',
    'family_law',
    'labor_law',
    'commercial_litigation',
    'corporate',
    'criminal_defense',
    'administrative_law',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lead_source AS ENUM (
    'hero_form',
    'contact_section',
    'popup',
    'whatsapp',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM (
    'new',
    'contacted',
    'qualified',
    'converted',
    'closed',
    'spam'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Leads table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact info
  full_name        TEXT          NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 100),
  phone            TEXT          NOT NULL CHECK (phone ~ '^(\+972|0)[-\s]?(5[0-9]|[23489])[-\s]?\d{7}$'),
  email            TEXT          CHECK (email IS NULL OR email ~* '^[^@]+@[^@]+\.[^@]+$'),

  -- Inquiry details
  subject          practice_area_subject NOT NULL,
  message          TEXT          CHECK (message IS NULL OR char_length(message) <= 1000),

  -- Consent & compliance (GDPR / Israeli Privacy Protection Law 5741-1981)
  consent_gdpr     BOOLEAN       NOT NULL DEFAULT FALSE CHECK (consent_gdpr = TRUE),
  consent_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- Tracking
  source           lead_source   NOT NULL DEFAULT 'contact_section',
  referrer_url     TEXT          CHECK (referrer_url IS NULL OR char_length(referrer_url) <= 2048),
  ip_address       INET,
  user_agent       TEXT,

  -- Workflow
  status           lead_status   NOT NULL DEFAULT 'new',
  notes            TEXT,
  assigned_to      TEXT,

  -- Timestamps
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── Prevent duplicate submissions from same phone in 10 minutes ────────────
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_recent_uq
  ON public.leads (phone)
  WHERE created_at > (now() - INTERVAL '10 minutes');

-- ── Indexes for admin queries ────────────────────────────────
CREATE INDEX IF NOT EXISTS leads_created_at_idx  ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx      ON public.leads (status);
CREATE INDEX IF NOT EXISTS leads_subject_idx     ON public.leads (subject);
CREATE INDEX IF NOT EXISTS leads_phone_idx       ON public.leads (phone);

-- ── Auto-update updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_set_updated_at ON public.leads;
CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Anonymous users (website visitors) can INSERT only
-- The service-role key bypasses RLS (used in API route)
CREATE POLICY "leads_anon_insert" ON public.leads
  FOR INSERT
  TO anon
  WITH CHECK (
    consent_gdpr = TRUE
  );

-- Authenticated admin users can read all leads
CREATE POLICY "leads_admin_select" ON public.leads
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- Authenticated admin users can update lead status / notes
CREATE POLICY "leads_admin_update" ON public.leads
  FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- No direct DELETE allowed — use status='spam' instead
-- (preserves audit trail and complies with data retention obligations)

-- ── Comments for documentation ───────────────────────────────
COMMENT ON TABLE public.leads IS
  'Consultation request submissions from the Aviv Iasso Law Office landing page. Contains PII — handle per Israeli Privacy Protection Law 5741-1981 and GDPR where applicable.';

COMMENT ON COLUMN public.leads.consent_gdpr IS
  'User explicitly consented to data processing before form submission. Required TRUE to satisfy Israeli Privacy Protection Regulations (Data Security) 2017.';

COMMENT ON COLUMN public.leads.ip_address IS
  'Client IP address stored for spam detection only. Retention period: 90 days per privacy policy.';

COMMENT ON COLUMN public.leads.status IS
  'Lead workflow status. Never delete records — set status to spam to suppress.';
