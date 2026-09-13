-- Rakuun schema setup.
--
-- Safe to re-run: every statement is idempotent. Note that this only covers
-- creating objects, not altering existing ones - once the contacts/interactions
-- work lands (Phase 0 step 1), real numbered migrations under
-- supabase/migrations/ replace this file.
--
-- Do not add anything here that modifies the auth schema. Referencing
-- auth.users and hanging a trigger off it are supported; altering it is not.

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_sessions table for extension-dashboard sync
-- NOTE: superseded by ADR-006/008 - drop this together with the
-- /api/auth/create-session and /api/auth/validate-session routes.
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create email_history table
CREATE TABLE IF NOT EXISTS public.email_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  context TEXT,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create bulk_campaigns table (for future use)
CREATE TABLE IF NOT EXISTS public.bulk_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_subject TEXT NOT NULL,
  template_body TEXT NOT NULL,
  context TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create campaign_emails table (for bulk email tracking)
CREATE TABLE IF NOT EXISTS public.campaign_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.bulk_campaigns(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON public.user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON public.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_history_user_id ON public.email_history(user_id);
CREATE INDEX IF NOT EXISTS idx_email_history_sent_at ON public.email_history(sent_at);
CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_user_id ON public.bulk_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_emails_campaign_id ON public.campaign_emails(campaign_id);

-- Enable RLS on all tables (already idempotent)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_emails ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- CREATE POLICY has no IF NOT EXISTS, so each one is dropped first.

-- User profiles: Users can only see and edit their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- User sessions: Users can only see their own sessions
DROP POLICY IF EXISTS "Users can view own sessions" ON public.user_sessions;
CREATE POLICY "Users can view own sessions" ON public.user_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sessions" ON public.user_sessions;
CREATE POLICY "Users can insert own sessions" ON public.user_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sessions" ON public.user_sessions;
CREATE POLICY "Users can update own sessions" ON public.user_sessions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own sessions" ON public.user_sessions;
CREATE POLICY "Users can delete own sessions" ON public.user_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Email history: Users can only see their own emails
DROP POLICY IF EXISTS "Users can view own email history" ON public.email_history;
CREATE POLICY "Users can view own email history" ON public.email_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own email history" ON public.email_history;
CREATE POLICY "Users can insert own email history" ON public.email_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Bulk campaigns: Users can only see their own campaigns
DROP POLICY IF EXISTS "Users can view own campaigns" ON public.bulk_campaigns;
CREATE POLICY "Users can view own campaigns" ON public.bulk_campaigns
  FOR ALL USING (auth.uid() = user_id);

-- Campaign emails: Users can only see emails from their own campaigns
DROP POLICY IF EXISTS "Users can view own campaign emails" ON public.campaign_emails;
CREATE POLICY "Users can view own campaign emails" ON public.campaign_emails
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.bulk_campaigns
      WHERE id = campaign_emails.campaign_id
      AND user_id = auth.uid()
    )
  );

-- Create function to automatically create user profile on signup
-- SET search_path is required on SECURITY DEFINER functions: without it the
-- caller's search_path decides which schema the unqualified names resolve to,
-- which is a privilege escalation vector.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  -- A failure here rolls back the whole signup and surfaces as an opaque
  -- "Database error saving new user", so don't let a duplicate cause one.
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Create trigger to run the function
-- CREATE TRIGGER has no IF NOT EXISTS, and the trigger lives on auth.users, so
-- it survives dropping every table in public - drop it explicitly.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to clean up expired sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.user_sessions
  WHERE expires_at < NOW();
END;
$$;
