"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase-browser";

export default function SignIn() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBrowserSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace("/dashboard");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function handleSignIn() {
    setError(null);
    const { error: signInError } = await getBrowserSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` }
    });
    if (signInError) setError(signInError.message);
  }

  if (checking) {
    return <p className="text-sm text-coffee-secondary">Loading...</p>;
  }

  return (
    <div className="w-full max-w-sm text-center">
      <h1 className="text-3xl font-bold tracking-tight text-coffee-primary">Rakuun</h1>
      <p className="mt-1 text-sm text-coffee-secondary">Outreach, personalized</p>

      <p className="mx-auto mt-6 max-w-xs text-sm text-coffee-text-dark">
        Everyone you capture from the extension or a business card, in one place.
      </p>

      <button
        onClick={handleSignIn}
        className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-lg border border-coffee-medium-gray bg-coffee-white px-5 py-3 text-sm font-semibold text-coffee-text-dark shadow-coffee transition hover:border-coffee-primary hover:shadow-coffee-hover"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Sign in with Google
      </button>

      {error && (
        <p className="mt-4 rounded-md border border-coffee-medium-gray bg-coffee-light-gray px-3 py-2 text-xs text-coffee-text-dark">
          {error}
        </p>
      )}
    </div>
  );
}
