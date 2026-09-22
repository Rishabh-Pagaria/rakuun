-- The unified contacts model (ADR-001) plus its interaction log.
--
-- One contacts table for every capture surface, told apart by `source`. The
-- extension, the card scanner, the dashboard and the future MCP agent all read
-- and write this same shape.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  -- Nullable: business cards often carry a phone number and no email.
  email TEXT,
  company TEXT,
  title TEXT,
  phone TEXT,
  source TEXT NOT NULL CHECK (source IN ('extension', 'card_scan', 'manual')),
  -- Source-specific extras: the original selected text, raw Gemini OCR output.
  raw_capture JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- Callers normalize; the database enforces, so casing can't split one person in two.
  CONSTRAINT contacts_email_lowercase CHECK (email IS NULL OR email = lower(email)),
  -- Plain constraint, not a partial index: NULL emails are distinct in Postgres
  -- so they never collide, and PostgREST upserts can only target this form.
  CONSTRAINT contacts_user_email_unique UNIQUE (user_id, email)
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON public.contacts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON public.contacts USING GIN (tags);

DROP TRIGGER IF EXISTS contacts_set_updated_at ON public.contacts;
CREATE TRIGGER contacts_set_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('email_sent', 'note', 'scan')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_contact_id
  ON public.interactions(contact_id, created_at DESC);

-- Links historical sends to the unified model. SET NULL so deleting a contact
-- doesn't erase the record that an email was sent.
ALTER TABLE public.email_history
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_history_contact_id ON public.email_history(contact_id);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own contacts" ON public.contacts;
CREATE POLICY "Users can view own contacts" ON public.contacts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own contacts" ON public.contacts;
CREATE POLICY "Users can insert own contacts" ON public.contacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- WITH CHECK as well as USING, or a row could be updated to another user_id.
DROP POLICY IF EXISTS "Users can update own contacts" ON public.contacts;
CREATE POLICY "Users can update own contacts" ON public.contacts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own contacts" ON public.contacts;
CREATE POLICY "Users can delete own contacts" ON public.contacts
  FOR DELETE USING (auth.uid() = user_id);

-- interactions has no user_id of its own, so ownership is checked by joining
-- through contacts (ARCHITECTURE.md section 7).
DROP POLICY IF EXISTS "Users can view own interactions" ON public.interactions;
CREATE POLICY "Users can view own interactions" ON public.interactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = interactions.contact_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own interactions" ON public.interactions;
CREATE POLICY "Users can insert own interactions" ON public.interactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = interactions.contact_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own interactions" ON public.interactions;
CREATE POLICY "Users can update own interactions" ON public.interactions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = interactions.contact_id AND c.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = interactions.contact_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own interactions" ON public.interactions;
CREATE POLICY "Users can delete own interactions" ON public.interactions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = interactions.contact_id AND c.user_id = auth.uid()
    )
  );

-- Needed so a send can be linked to its contact after the row already exists.
DROP POLICY IF EXISTS "Users can update own email history" ON public.email_history;
CREATE POLICY "Users can update own email history" ON public.email_history
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
