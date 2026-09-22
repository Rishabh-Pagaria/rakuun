-- Removes the bespoke session store superseded by ADR-006/008.
--
-- /api/auth/create-session took user.id straight from the request body and
-- wrote it with the service-role key, and /api/auth/validate-session handed
-- back stored Google access and refresh tokens. Both routes are deleted;
-- Supabase Auth is the only identity system now.

DROP FUNCTION IF EXISTS public.cleanup_expired_sessions();
DROP TABLE IF EXISTS public.user_sessions CASCADE;
