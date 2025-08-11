# Supabase Setup Guide for Rakuun Extension

## 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up/Sign in to your account
3. Click "New Project"
4. Choose your organization
5. Fill in project details:
   - Name: `rakuun-extension`
   - Database Password: (choose a strong password)
   - Region: (choose closest to you)
6. Click "Create new project"

## 2. Configure Google OAuth Provider

1. In your Supabase dashboard, go to **Authentication > Providers**
2. Find **Google** and click **Enable**
3. You'll need to create a Google OAuth app:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or use existing
   - Enable Google+ API
   - Go to **Credentials > Create Credentials > OAuth 2.0 Client IDs**
   - Application type: **Web application**
   - Authorized redirect URIs: 
     - `https://your-project-ref.supabase.co/auth/v1/callback`
     - `chrome-extension://your-extension-id/popup.html` (you'll get this after building the extension)
   - Copy **Client ID** and **Client Secret**

4. Back in Supabase, paste the Google credentials:
   - **Client ID**: Your Google OAuth Client ID
   - **Client Secret**: Your Google OAuth Client Secret
   - **Authorized Client IDs**: Your Google OAuth Client ID (same as above)
   - **Scopes**: `email profile https://www.googleapis.com/auth/gmail.send`

5. Click **Save**

## 3. Set up Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Create a new query
3. Copy and paste the contents of `supabase/setup.sql`
4. Run the query

## 4. Get Supabase Keys

1. Go to **Settings > API**
2. Copy the following values:
   - **Project URL** (looks like: `https://abcdefghijk.supabase.co`)
   - **Project API Keys > anon public** (starts with `eyJ...`)
   - **Project API Keys > service_role** (starts with `eyJ...`)

## 5. Update Environment Variables

Update your `.env.local` file with the Supabase values:

```bash
# Replace these with your actual Supabase values
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key
```

## 6. Update Extension Configuration

Update `extension/supabase-client.js` with your Supabase values:

```javascript
constructor() {
  this.supabaseUrl = 'https://abcdefghijk.supabase.co';
  this.supabaseAnonKey = 'eyJ...your-anon-key';
  // ...
}
```

## 7. Test the Setup

1. Start your Next.js development server: `npm run dev`
2. Load the extension in Chrome (we'll update the code in the next step)
3. Test sign-in functionality

## Next Steps

Once you complete this setup, we'll proceed to:
- Step 2: Rewrite the authentication code in popup.js to use Supabase Auth
- Step 3: Update the manifest.json accordingly

Let me know when you've completed the Supabase setup and I'll help you with the next steps!
