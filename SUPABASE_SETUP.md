# Supabase + Google OAuth setup for the Rakuun extension

Rakuun is self-hosted and single-tenant: you run your own Supabase project and
your own Google OAuth clients. This walks through both.

Auth is split deliberately (see ADR-003 and ADR-008 in `docs/ARCHITECTURE.md`):

- **Supabase Auth** answers *who is this user* and supplies the token the
  extension sends to the Rakuun API, so Postgres RLS can key off `auth.uid()`.
- **Chrome's identity API** supplies the `gmail.send` token, because Chrome
  refreshes it natively without needing a client secret.

That split is why you need **two Google OAuth clients**. They are different
application types and cannot be the same client.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New Project** — name it `rakuun`, pick a strong database password and the
   closest region. The free tier is sufficient (ADR-007).

## 2. Pin your extension ID

`chrome.identity` derives the OAuth redirect URL from the extension's ID, and
an unpacked extension gets a **different ID on every machine** unless you pin
it. Do this before configuring OAuth, or you will have to redo steps 3–5.

1. Load the extension once: `chrome://extensions` → enable **Developer mode** →
   **Load unpacked** → select the `extension/` folder.
2. Copy the extension ID shown on the card.
3. To keep that ID stable across machines and reloads, pack the extension once
   (**Pack extension** on the same page) and add the resulting public key to
   `extension/manifest.json` as a top-level `"key"` field. Without this, every
   fresh install gets a new ID and sign-in will fail with a redirect mismatch.

Your redirect URL is `https://<extension-id>.chromiumapp.org/`. Keep it handy —
steps 3 and 5 both need it. The extension also logs it to the popup console if
sign-in fails.

## 3. Google OAuth client #1 — Web application (for Supabase / identity)

In the [Google Cloud Console](https://console.cloud.google.com/) → **APIs &
Services → Credentials**:

1. **Create Credentials → OAuth 2.0 Client ID**, type **Web application**.
2. Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and **Client Secret**.

The secret stays in Supabase's dashboard — it is never shipped to the extension.

## 4. Google OAuth client #2 — Chrome Extension (for Gmail)

Still in **Credentials**:

1. **Create Credentials → OAuth 2.0 Client ID**, type **Chrome Extension**.
2. Item ID: the extension ID from step 2.
3. Copy the **Client ID** into `extension/manifest.json` under
   `oauth2.client_id`, replacing the one committed there.
4. Enable the **Gmail API** for the project (**APIs & Services → Library**).

On the **OAuth consent screen**, add the `.../auth/gmail.send` scope. It is a
sensitive scope: fine for your own account in testing mode, but it requires
Google verification before any wider distribution.

## 5. Configure the Supabase Google provider

1. **Authentication → Providers → Google → Enable**.
2. Paste the **Client ID** and **Client Secret** from step 3 (the *Web
   application* client — not the Chrome Extension one).
3. Leave scopes at the default. Gmail scope is **not** requested here; Chrome
   handles it separately (ADR-008).
4. **Authentication → URL Configuration → Redirect URLs**: add
   `https://<extension-id>.chromiumapp.org/` exactly as it appears.

Skipping 5.4 is the single most common setup failure. Its symptom is an auth
window that opens and never closes, not an error message.

## 6. Set up the database schema

Open **SQL Editor → New query** and run each file in `supabase/migrations/`
**in filename order**, oldest first:

```
20260918000001_initial_schema.sql
20260918000002_drop_user_sessions.sql
20260918000003_contacts_and_interactions.sql
```

Every migration is idempotent, so re-running one is harmless — useful if you
lose track of which have been applied. Add new schema changes as a new file
rather than editing one that has already run.

The filenames follow the Supabase CLI's convention, so `supabase db push` will
pick them up unchanged if you adopt the CLI later.

## 7. Fill in your environment

Copy `.env.example` to `.env.local` and fill it in from **Settings → API**:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` — Project URL, e.g. `https://abcdefghijk.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the `anon public` key
- `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` key (server-side only; it
  bypasses RLS, so never expose it to the extension or a `NEXT_PUBLIC_` var)
- `GEMINI_API_KEY` — from [AI Studio](https://aistudio.google.com/apikey)

## 8. Build and run

```bash
npm install
npm run build:extension   # generates extension/config.js from .env.local
npm run dev               # Next.js API on http://localhost:3000
```

`extension/config.js` is generated and gitignored — never edit it directly, and
never hardcode credentials into `extension/supabase-client.js`. Re-run
`build:extension` whenever `.env.local` changes, then hit **Reload** on the
extension card in `chrome://extensions`.

If you point `NEXT_PUBLIC_APP_URL` at something other than
`http://localhost:3000`, add that origin to `host_permissions` in
`extension/manifest.json` too — the extension cannot call an origin it has no
permission for.

## 9. Verify

1. Open the extension → **Sign in with Google**. You should see a Google
   consent screen, and the window should close on its own.
2. Select some text on any normal webpage, open the extension — the selection
   appears in the textarea.
3. Pick a purpose → **Generate**. Gemini fills in recipient, subject, and body.
4. **Send Email**. The *first* send prompts separately for Gmail permission —
   that is expected, and it is the only time it asks.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Auth window opens, never closes | Redirect URL missing from Supabase's allow-list (step 5.4) |
| "Extension not configured" | `npm run build:extension` hasn't been run, or `.env.local` is incomplete |
| Sign-in worked yesterday, fails today | Extension ID changed — pin it with a `"key"` field (step 2.3) |
| Gmail consent rejected | `gmail.send` scope missing from the consent screen, or Gmail API not enabled (step 4) |
| Send fails with 401 after long idle | Expected once; the extension refreshes the token and retries automatically |
