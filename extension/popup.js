// Rakuun extension popup.
//
// Auth split (ADR-008): Supabase Auth answers "who is this user" and supplies
// the bearer token sent to the Rakuun API; Chrome's identity API supplies the
// gmail.send token. See supabase-client.js and gmail-auth.js.

// managing the state for authentication
let currentUser = null;
let originalSelectedText = null;
let lastGeneratedContext = null;
let isEmailGenerated = false;

// DOM elements for authentication
const signinScreen = document.getElementById("signin-screen");
const mainScreen = document.getElementById("main-screen");
const signinButton = document.getElementById("signin-btn");
const signoutButton = document.getElementById("signout-btn");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");

// User based dom elements
const bodyInput = document.getElementById("body");
const recipientEmail = document.getElementById("to");
const subjectEmail = document.getElementById("subject");
const generateBtn = document.getElementById("generateBtn");
const sendBtn = document.getElementById("sendBtn");
const output = document.getElementById("output");
const contextSelect = document.getElementById("context");

document.addEventListener("DOMContentLoaded", () => {
  // Initialize authentication first, because this determines whether the user
  // has a valid Supabase session and therefore which screen to show.
  initializeAuthentication();
});

// The authentication flow
async function initializeAuthentication() {
  // Event listeners go on first so the sign-in button works even if the
  // session check below fails.
  setupAuthEventListeners();

  if (typeof CONFIG === "undefined" || !supabaseExtension.isConfigured()) {
    showSignInScreen();
    if (signinButton) signinButton.disabled = true;
    showOutput(
      "Extension not configured. Run: npm run build:extension",
      "error"
    );
    return;
  }

  try {
    // getSession() refreshes an expired session automatically and returns null
    // only when the user genuinely has to sign in again.
    currentUser = await supabaseExtension.getUser();

    if (currentUser) {
      showMainScreen();
      await initializeMainApp();
    } else {
      showSignInScreen();
    }
  } catch (error) {
    console.error("Error initializing authentication:", error);
    showSignInScreen();
  }
}

const setupAuthEventListeners = () => {
  if (signinButton) {
    signinButton.addEventListener("click", handleSignIn);
  }
  if (signoutButton) {
    signoutButton.addEventListener("click", handleSignOut);
  }
};

// handle Google sign-in process
async function handleSignIn() {
  try {
    if (!chrome.identity) {
      throw new Error("Chrome Identity API is not available. Please check manifest.json permissions.");
    }

    // disables the button and shows loading animation
    signinButton.disabled = true;
    signinButton.innerHTML = `
      <div class="button-spinner"></div>
      Signing in...
    `;

    await supabaseExtension.signInWithGoogle();
    currentUser = await supabaseExtension.getUser();

    if (!currentUser) {
      throw new Error("Signed in, but no session was stored.");
    }

    hideOutput();
    showMainScreen();
    await initializeMainApp();
  } catch (error) {
    console.error("Sign-in error:", error);
    showOutput("Sign-in failed: " + error.message, "error");
    resetSignInButton();
  }
}

// Handling sign-out process
async function handleSignOut() {
  try {
    // Both credentials have to go: the Supabase session that identifies the
    // user, and the Google grant that lets us send mail as them.
    await supabaseExtension.signOut();
    await gmailAuth.revoke();
  } catch (error) {
    console.error("Sign-out error:", error);
  } finally {
    currentUser = null;
    originalSelectedText = null;
    lastGeneratedContext = null;
    isEmailGenerated = false;
    clearComposeFields();
    showSignInScreen();
  }
}

// show main sccreen
const showMainScreen = () => {
  if (signinScreen) signinScreen.style.display = "none";
  if (mainScreen) mainScreen.style.display = "block";

  // Update user info in the main screen
  if (currentUser && userAvatar && userName) {
    userAvatar.src = currentUser.picture || "icons/logo.png";
    userName.textContent = currentUser.name || "User";
  }
};

// show sign-in screen
const showSignInScreen = () => {
  if (signinScreen) signinScreen.style.display = "block";
  if (mainScreen) mainScreen.style.display = "none";
  // Reset user info in the sign-in screen
  resetSignInButton();
};

const resetSignInButton = () => {
  if (signinButton) {
    signinButton.disabled = false;
    signinButton.innerHTML = `
      <svg class="google-icon" width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Sign in with Google
    `;
  }
};

const clearComposeFields = () => {
  if (bodyInput) bodyInput.value = "";
  if (recipientEmail) recipientEmail.value = "";
  if (subjectEmail) subjectEmail.value = "";
};

// Reads the current selection straight out of the active tab when the popup
// opens. Nothing is captured or stored until the user actually opens Rakuun.
async function readSelectionFromActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return "";

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString().trim()
    });

    return (injection && injection.result) || "";
  } catch (error) {
    // Injection is blocked on chrome:// pages, the Web Store, and PDF viewers.
    console.debug("Could not read the page selection:", error.message);
    return "";
  }
}

// Initialize the main application after authentication
const initializeMainApp = async () => {
  // Set up event listeners before the await so the UI is responsive while the
  // selection is being read.
  if (recipientEmail) recipientEmail.addEventListener("input", checkSendButtonState);
  if (subjectEmail) subjectEmail.addEventListener("input", checkSendButtonState);
  if (bodyInput) bodyInput.addEventListener("input", checkSendButtonState);
  if (contextSelect) contextSelect.addEventListener("change", handleContextChange);
  if (generateBtn) generateBtn.addEventListener("click", handleGenerateEmail);
  if (sendBtn) sendBtn.addEventListener("click", handleSendEmail);

  const selectedText = await readSelectionFromActiveTab();
  if (selectedText && bodyInput) {
    originalSelectedText = selectedText; // Store the original selected text
    bodyInput.value = selectedText; // Set the textarea value to the selected text
    isEmailGenerated = false;
  }

  // Initial check for send button state
  checkSendButtonState();
};

// Handle context change event with automatic email generation
async function handleContextChange() {
  const newContext = contextSelect.value;

  // checking if the context has changed and if the email is generated
  if (isEmailGenerated && originalSelectedText && newContext !== lastGeneratedContext) {
    // regeneration indicator
    showOutput(`Updating email for ${getContextDisplayName(newContext)} context...`, "");
    await generateEmailWithContext(newContext);
  }
  checkSendButtonState();
}

// Check if send button should be enabled
const checkSendButtonState = () => {
  if (!recipientEmail || !subjectEmail || !bodyInput || !sendBtn) return;
  const hasEmail = recipientEmail.value.trim() !== "";
  const hasSubject = subjectEmail.value.trim() !== "";
  const hasBody = bodyInput.value.trim() !== "";

  sendBtn.disabled = !(hasEmail && hasSubject && hasBody);
};

// Show output with animation
function showOutput(message, type = "") {
  if (output) {
    output.textContent = message;
    output.className = `output show ${type}`;
  }
}

// Hide output
function hideOutput() {
  if (output) output.className = "output";
}

// Raised when there is no usable Supabase session left, so callers can drop
// the user back to the sign-in screen instead of showing a generic error.
class SessionExpiredError extends Error {
  constructor() {
    super("Your session expired. Please sign in again.");
    this.name = "SessionExpiredError";
  }
}

// Every API call carries the Supabase access token so the backend can resolve
// auth.uid() rather than trusting a user id from the request body (ADR-002).
async function apiFetch(path, payload) {
  const accessToken = await supabaseExtension.getAccessToken();
  if (!accessToken) {
    throw new SessionExpiredError();
  }

  return fetch(`${CONFIG.API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

async function handleSessionExpired() {
  currentUser = null;
  await supabaseExtension.clearSession();
  showSignInScreen();
  showOutput("Your session expired. Please sign in again.", "error");
}

async function handleGenerateEmail() {
  // use original text if available, otherwise use the current body text value
  const selectedText = originalSelectedText || bodyInput.value.trim();
  const selectedContext = contextSelect.value;

  if (!selectedText) {
    showOutput("Please select some text on the page, or type it in above.", "error");
    return;
  }
  await generateEmailWithContext(selectedContext, selectedText);
}

async function generateEmailWithContext(context, textToUse = null) {
  const selectedText = textToUse || originalSelectedText || bodyInput.value.trim();

  // Start loading animation
  generateBtn.classList.add("loading");
  generateBtn.disabled = true;
  showOutput("Generating your personalized email...");

  try {
    const res = await apiFetch("/api/generateEmail", { selectedText, context });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.email) {
      // Replace textarea with generated email
      bodyInput.value = data.email;
      // set recipient field value with extracted recipient's email
      recipientEmail.value = data.to || "";
      // set subject field value with generated subject
      subjectEmail.value = data.subject || "";

      // track email generation state
      isEmailGenerated = true;
      lastGeneratedContext = context; // Store the last used context
      showOutput("Email generated successfully! You can edit it above.", "success");

      // Check if send button should be enabled after generation
      checkSendButtonState();
    } else {
      showOutput(data.error || "Failed to generate email. Please try again.", "error");
    }
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      await handleSessionExpired();
      return;
    }
    showOutput("Network error: " + err.message, "error");
  } finally {
    // Stop loading animation
    generateBtn.classList.remove("loading");
    generateBtn.disabled = false;
  }
}

// Sends via the API, retrying once with a fresh Gmail token. Chrome hands back
// a cached token that Google may have already expired or revoked, and the only
// way to find out is the 401 - so recover from it instead of stranding the user.
async function postEmail(payload, { allowRetry = true } = {}) {
  const gmailToken = await gmailAuth.getAccessToken();
  const res = await apiFetch("/api/sendEmail", { ...payload, userToken: gmailToken });

  if (res.status === 401 && allowRetry) {
    await gmailAuth.invalidate(gmailToken);
    return postEmail(payload, { allowRetry: false });
  }

  return { res, data: await res.json().catch(() => ({})) };
}

async function handleSendEmail() {
  if (!recipientEmail || !subjectEmail || !bodyInput) return;
  const to = recipientEmail.value.trim();
  const subject = subjectEmail.value.trim();
  const body = bodyInput.value.trim();

  if (!to || !subject || !body) {
    showOutput("Please ensure all fields are filled before sending.", "error");
    return;
  }

  // Start loading animation
  sendBtn.classList.add("loading");
  sendBtn.disabled = true;
  showOutput("Sending email...");

  try {
    const { res, data } = await postEmail({ to, subject, body });

    if (res.ok && data.success) {
      showOutput("Email sent successfully!", "success");
    } else {
      showOutput(data.error || "Failed to send email. Please try again.", "error");
    }
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      await handleSessionExpired();
      return;
    }
    showOutput("Network error: " + err.message, "error");
  } finally {
    // Stop loading animation
    sendBtn.classList.remove("loading");
    checkSendButtonState(); // Re-enable button based on current state
  }
}

// Helper function to get context display name
const getContextDisplayName = (context) => {
  const names = {
    job_application: "Job application",
    research_collaboration: "Research collaboration",
    ta_application: "TA application",
    internship_inquiry: "Internship inquiry",
    networking: "Professional networking",
    phd_inquiry: "PhD inquiry",
    conference_meeting: "Conference meeting",
    guest_lecture: "Guest lecture"
  };
  return names[context] || "Professional";
};
