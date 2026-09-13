// Supabase Auth: identity only (ADR-003, ADR-008). Gmail lives in gmail-auth.js.

const SESSION_STORAGE_KEY = 'supabase_session';
const EXPIRY_SKEW_SECONDS = 60;

// Written by the pre-ADR-006 flow; cleared so a stale Google token can't look
// like a valid session.
const LEGACY_STORAGE_KEYS = [
  'userToken',
  'userInfo',
  'tokenExpiry',
  'supabase_expires_at',
  'selectedText'
];

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 64 bytes -> 86 base64url chars, inside RFC 7636's 43-128 range.
function createCodeVerifier() {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(64)));
}

async function deriveCodeChallenge(codeVerifier) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier)
  );
  return base64UrlEncode(new Uint8Array(digest));
}

function launchWebAuthFlow(url) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!redirectUrl) {
        reject(new Error('Sign-in was cancelled.'));
      } else {
        resolve(redirectUrl);
      }
    });
  });
}

class SupabaseExtensionClient {
  constructor() {
    // Tolerates a missing config.js so the failure is a clear message at call
    // time rather than a ReferenceError while the popup loads.
    const config = (typeof CONFIG !== 'undefined' && CONFIG) || {};
    this.supabaseUrl = config.SUPABASE_URL || '';
    this.supabaseAnonKey = config.SUPABASE_ANON_KEY || '';
    this.authUrl = `${this.supabaseUrl}/auth/v1`;
    this.refreshInFlight = null;
  }

  isConfigured() {
    return Boolean(this.supabaseUrl && this.supabaseAnonKey);
  }

  // Chrome only auto-closes the auth window for chromiumapp.org redirects.
  getRedirectUrl() {
    return chrome.identity.getRedirectURL();
  }

  buildHeaders(extraHeaders = {}) {
    return {
      apikey: this.supabaseAnonKey,
      Authorization: `Bearer ${this.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    };
  }

  async signInWithGoogle() {
    if (!this.isConfigured()) {
      throw new Error('Extension config missing. Run: npm run build:extension');
    }

    const codeVerifier = createCodeVerifier();
    const codeChallenge = await deriveCodeChallenge(codeVerifier);
    const redirectUrl = this.getRedirectUrl();

    const authorizeUrl = `${this.authUrl}/authorize?${new URLSearchParams({
      provider: 'google',
      redirect_to: redirectUrl,
      code_challenge: codeChallenge,
      code_challenge_method: 's256'
    })}`;

    console.debug('Authorize URL:', authorizeUrl);

    let redirectResponse;
    try {
      redirectResponse = await launchWebAuthFlow(authorizeUrl);
    } catch (error) {
      // Usually a missing allow-list entry, which presents as a window that never closes.
      console.error(
        `Sign-in flow failed. Confirm this exact URL is listed under Supabase ` +
          `Authentication > URL Configuration > Redirect URLs:\n  ${redirectUrl}`
      );
      throw error;
    }

    return this.exchangeCodeForSession(redirectResponse, codeVerifier);
  }

  async exchangeCodeForSession(redirectResponse, codeVerifier) {
    const params = new URL(redirectResponse).searchParams;
    const errorDescription = params.get('error_description') || params.get('error');
    if (errorDescription) {
      throw new Error(errorDescription);
    }

    const code = params.get('code');
    if (!code) {
      throw new Error('Sign-in did not return an authorization code.');
    }

    const response = await fetch(`${this.authUrl}/token?grant_type=pkce`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier })
    });

    if (!response.ok) {
      throw new Error(await this.describeAuthError(response, 'Failed to complete sign-in'));
    }

    return this.storeSession(await response.json());
  }

  async storeSession(session) {
    if (!session || !session.access_token) {
      throw new Error('Supabase returned an invalid session.');
    }

    const normalized = {
      ...session,
      // Derived when absent so expiry checks can't silently pass.
      expires_at:
        session.expires_at ||
        Math.floor(Date.now() / 1000) + (session.expires_in || 3600)
    };

    await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: normalized });
    return normalized;
  }

  async clearSession() {
    await chrome.storage.local.remove([SESSION_STORAGE_KEY, ...LEGACY_STORAGE_KEYS]);
  }

  async getSession() {
    const stored = await chrome.storage.local.get(SESSION_STORAGE_KEY);
    const session = stored[SESSION_STORAGE_KEY];

    if (!session || !session.access_token) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now < session.expires_at - EXPIRY_SKEW_SECONDS) {
      return session;
    }

    if (!session.refresh_token) {
      await this.clearSession();
      return null;
    }

    return this.refreshSession(session.refresh_token);
  }

  // Single-flight: refresh tokens are single-use and the popup can ask twice at once.
  async refreshSession(refreshToken) {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = (async () => {
      try {
        const response = await fetch(`${this.authUrl}/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (!response.ok) {
          throw new Error(await this.describeAuthError(response, 'Session refresh failed'));
        }

        return await this.storeSession(await response.json());
      } catch (error) {
        console.error('Error refreshing session:', error);
        await this.clearSession();
        return null;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  async getAccessToken() {
    const session = await this.getSession();
    return session ? session.access_token : null;
  }

  async getUser() {
    const session = await this.getSession();
    if (!session || !session.user) {
      return null;
    }

    const metadata = session.user.user_metadata || {};
    return {
      id: session.user.id,
      email: session.user.email,
      name: metadata.full_name || metadata.name || session.user.email,
      picture: metadata.avatar_url || metadata.picture || null
    };
  }

  async signOut() {
    try {
      const stored = await chrome.storage.local.get(SESSION_STORAGE_KEY);
      const session = stored[SESSION_STORAGE_KEY];

      if (session && session.access_token) {
        await fetch(`${this.authUrl}/logout`, {
          method: 'POST',
          headers: this.buildHeaders({ Authorization: `Bearer ${session.access_token}` })
        });
      }
    } catch (error) {
      // Revoking server-side is best effort; clearing locally is not.
      console.error('Error signing out of Supabase:', error);
    } finally {
      await this.clearSession();
    }
  }

  async describeAuthError(response, fallbackMessage) {
    try {
      const body = await response.json();
      const detail = body.error_description || body.msg || body.error;
      if (detail) {
        return `${fallbackMessage}: ${detail}`;
      }
    } catch {
      // Non-JSON error body.
    }
    return `${fallbackMessage} (HTTP ${response.status})`;
  }
}

const supabaseExtension = new SupabaseExtensionClient();
