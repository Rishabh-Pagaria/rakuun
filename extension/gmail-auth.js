// Gmail access for the Rakuun Chrome extension (ADR-008).
//
// Chrome brokers the gmail.send token and refreshes it natively, so no Google
// client secret ever has to live in the extension. This is deliberately NOT
// Supabase's session.provider_token: Supabase returns provider tokens only on
// the initial sign-in response and does not return them after a session
// refresh, so a provider_token-based implementation stops sending roughly an
// hour after sign-in.
//
// This module is the entire seam between Rakuun and Google's Gmail
// credentials. If Gmail token handling later moves server-side (see ADR-008),
// this file is what gets replaced - nothing else needs to change.

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

const gmailAuth = {
  // Prompts for gmail.send consent the first time only; Chrome serves a
  // cached, auto-refreshed token afterwards.
  getAccessToken({ interactive = true } = {}) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive, scopes: GMAIL_SCOPES }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!token) {
          reject(new Error('Gmail access was not granted.'));
        } else {
          resolve(token);
        }
      });
    });
  },

  // Drops a token Google has already rejected, so the next getAccessToken()
  // fetches a fresh one instead of handing back the same dead token.
  invalidate(token) {
    return new Promise((resolve) => {
      if (!token) {
        resolve();
        return;
      }
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });
  },

  // Full teardown on sign-out: revoke at Google, then clear Chrome's cache.
  // Without the revoke, "sign out" only forgets the token locally while the
  // grant stays live on the user's Google account.
  async revoke() {
    try {
      const token = await this.getAccessToken({ interactive: false });
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: 'POST'
      });
      await this.invalidate(token);
    } catch (error) {
      // No cached token to revoke is the normal case here, not a failure.
      console.debug('No Gmail token to revoke:', error.message);
    }

    await new Promise((resolve) => chrome.identity.clearAllCachedAuthTokens(resolve));
  }
};
