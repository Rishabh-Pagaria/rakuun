// ADR-008: Chrome brokers the gmail.send token and refreshes it natively, so no
// client secret is needed. Replacing this file is the whole cost of moving Gmail
// token handling server-side later.

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

const gmailAuth = {
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

  // Drops a token Google already rejected so the next call fetches a fresh one.
  invalidate(token) {
    return new Promise((resolve) => {
      if (!token) {
        resolve();
        return;
      }
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });
  },

  async revoke() {
    try {
      const token = await this.getAccessToken({ interactive: false });
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: 'POST'
      });
      await this.invalidate(token);
    } catch (error) {
      // No cached token to revoke is the normal case, not a failure.
      console.debug('No Gmail token to revoke:', error.message);
    }

    await new Promise((resolve) => chrome.identity.clearAllCachedAuthTokens(resolve));
  }
};
