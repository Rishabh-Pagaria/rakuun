// Sign-in runs here, not in the popup: Chrome destroys the popup when the auth
// window takes focus, killing the flow mid-exchange.
importScripts('config.js', 'supabase-client.js');

const AUTH_ERROR_KEY = 'auth_error';

async function handleSignIn() {
  await chrome.storage.local.remove(AUTH_ERROR_KEY);

  try {
    await supabaseExtension.signInWithGoogle();
    const user = await supabaseExtension.getUser();

    if (!user) {
      throw new Error('Signed in, but no session was stored.');
    }

    return { ok: true, user };
  } catch (error) {
    console.error('Sign-in failed:', error);
    // Persisted because the popup is usually gone by now and would never show it.
    await chrome.storage.local.set({ [AUTH_ERROR_KEY]: error.message });
    return { ok: false, error: error.message };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SIGN_IN') {
    handleSignIn().then(sendResponse);
    return true; // keeps the channel open for the async response
  }
  return false;
});
