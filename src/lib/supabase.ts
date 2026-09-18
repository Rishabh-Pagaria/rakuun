import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Bypasses RLS. Server-side only, and only for genuinely privileged work - a
// route using this owns the access check RLS would otherwise do for free.
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Scoped to one user's JWT, so every query runs under their RLS policies.
export function createServerSupabaseClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export type AuthenticatedRequest =
  | { ok: true; supabase: SupabaseClient; user: User; accessToken: string }
  | { ok: false; response: NextResponse }

function unauthorized(message: string): AuthenticatedRequest {
  return { ok: false, response: NextResponse.json({ error: message }, { status: 401 }) }
}

// Resolves who the caller is from the Authorization header. getUser() verifies
// the token against Supabase rather than trusting its payload, which is the
// whole point - a decoded-but-unverified JWT is just attacker-supplied JSON.
export async function authenticateRequest(req: NextRequest): Promise<AuthenticatedRequest> {
  const header = req.headers.get('authorization')

  if (!header?.startsWith('Bearer ')) {
    return unauthorized('Missing or malformed Authorization header')
  }

  const accessToken = header.slice('Bearer '.length).trim()
  if (!accessToken) {
    return unauthorized('Missing access token')
  }

  const supabase = createServerSupabaseClient(accessToken)
  const { data, error } = await supabase.auth.getUser(accessToken)

  if (error || !data.user) {
    return unauthorized('Invalid or expired session')
  }

  return { ok: true, supabase, user: data.user, accessToken }
}
