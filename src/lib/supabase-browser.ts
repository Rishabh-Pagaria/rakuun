import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Lazy so importing this from a Server Component doesn't construct anything.
export function getBrowserSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
  }
  return client;
}

// Every call goes through /api/* with the session as a bearer token (ADR-002);
// components never query Supabase tables directly.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await getBrowserSupabase().auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) throw new Error("Not signed in");

  return fetch(path, {
    ...init,
    headers: {
      ...init.headers,
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });
}
