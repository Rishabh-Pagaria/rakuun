// Supabase client for Chrome Extension
// This will be used in the extension popup and background scripts

class SupabaseExtensionClient {
  constructor() {
    this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    this.supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    this.apiUrl = `${this.supabaseUrl}/auth/v1`;
  }

  // Initialize Supabase Auth with Google provider
  async signInWithGoogle() {
    try {
      const response = await fetch(`${this.apiUrl}/authorize?provider=google&redirect_to=${encodeURIComponent('chrome-extension://your-extension-id/popup.html')}`, {
        method: 'GET',
        headers: {
          'apikey': this.supabaseAnonKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to initiate Google sign-in');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  }

  // Exchange authorization code for session
  async exchangeCodeForSession(code) {
    try {
      const response = await fetch(`${this.apiUrl}/token?grant_type=authorization_code`, {
        method: 'POST',
        headers: {
          'apikey': this.supabaseAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          auth_code: code,
          code_verifier: '', // We'll implement PKCE if needed
        })
      });

      if (!response.ok) {
        throw new Error('Failed to exchange code for session');
      }

      const session = await response.json();
      
      // Store session in chrome.storage.local
      await chrome.storage.local.set({
        supabase_session: session,
        supabase_expires_at: session.expires_at
      });

      return session;
    } catch (error) {
      console.error('Error exchanging code for session:', error);
      throw error;
    }
  }

  // Get current session from storage
  async getSession() {
    try {
      const result = await chrome.storage.local.get(['supabase_session', 'supabase_expires_at']);
      
      if (result.supabase_session && result.supabase_expires_at) {
        const now = Math.floor(Date.now() / 1000);
        
        if (now < result.supabase_expires_at) {
          return result.supabase_session;
        } else {
          // Session expired, try to refresh
          return await this.refreshSession(result.supabase_session.refresh_token);
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  // Refresh session using refresh token
  async refreshSession(refreshToken) {
    try {
      const response = await fetch(`${this.apiUrl}/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'apikey': this.supabaseAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: refreshToken
        })
      });

      if (!response.ok) {
        throw new Error('Failed to refresh session');
      }

      const session = await response.json();
      
      // Update stored session
      await chrome.storage.local.set({
        supabase_session: session,
        supabase_expires_at: session.expires_at
      });

      return session;
    } catch (error) {
      console.error('Error refreshing session:', error);
      await this.signOut();
      return null;
    }
  }

  // Sign out user
  async signOut() {
    try {
      const session = await this.getSession();
      
      if (session) {
        await fetch(`${this.apiUrl}/logout`, {
          method: 'POST',
          headers: {
            'apikey': this.supabaseAnonKey,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        });
      }
      
      // Clear stored session
      await chrome.storage.local.remove(['supabase_session', 'supabase_expires_at']);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  // Get user info from current session
  async getUser() {
    try {
      const session = await this.getSession();
      
      if (!session) {
        return null;
      }

      const response = await fetch(`${this.apiUrl}/user`, {
        method: 'GET',
        headers: {
          'apikey': this.supabaseAnonKey,
          'Authorization': `Bearer ${session.access_token}`,
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get user info');
      }

      const user = await response.json();
      return user;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  // Get access token for Gmail API
  async getGmailAccessToken() {
    try {
      const session = await this.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      // The provider_token contains the Google OAuth token for Gmail API
      return session.provider_token;
    } catch (error) {
      console.error('Error getting Gmail access token:', error);
      throw error;
    }
  }
}

// Export singleton instance
const supabaseExtension = new SupabaseExtensionClient();
