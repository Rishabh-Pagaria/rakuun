// ADR-008: Supabase Auth for identity, Chrome's identity API for gmail.send.

let currentUser = null;
let originalSelectedText = null;
let lastGeneratedContext = null;
let isEmailGenerated = false;

// Who Gemini identified in the page text, saved as a contact after a send.
// `email` records who it described, so an edited recipient doesn't inherit it.
let lastExtracted = { name: "", company: "", title: "", email: "" };

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
const contextSelect = document.getElementById("context");

// Both screens carry one, so a message shows on whichever is visible.
const outputs = document.querySelectorAll(".output");

document.addEventListener("DOMContentLoaded", () => {
  initializeAuthentication();
});

async function initializeAuthentication() {
  // Bound first so sign-in still works if the session check throws.
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
    // getUser() refreshes automatically; null means sign-in is genuinely needed.
    currentUser = await supabaseExtension.getUser();

    if (currentUser) {
      showMainScreen();
      await initializeMainApp();
    } else {
      showSignInScreen();
      await showStoredAuthError();
    }
  } catch (error) {
    console.error("Error initializing authentication:", error);
    showSignInScreen();
  }
}

async function showStoredAuthError() {
  const { auth_error: authError } = await chrome.storage.local.get("auth_error");
  if (authError) {
    await chrome.storage.local.remove("auth_error");
    showOutput("Sign-in failed: " + authError, "error");
  }
}

// Picks up the worker's result in the rarer case the popup survived sign-in.
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local" || currentUser) return;

  if (changes.supabase_session && changes.supabase_session.newValue) {
    currentUser = await supabaseExtension.getUser();
    if (currentUser) {
      hideOutput();
      showMainScreen();
      await initializeMainApp();
    }
  } else if (changes.auth_error && changes.auth_error.newValue) {
    resetSignInButton();
    await showStoredAuthError();
  }
});

const setupAuthEventListeners = () => {
  if (signinButton) {
    signinButton.addEventListener("click", handleSignIn);
  }
  if (signoutButton) {
    signoutButton.addEventListener("click", handleSignOut);
  }
};

async function handleSignIn() {
  try {
    if (!chrome.identity) {
      throw new Error("Chrome Identity API is not available. Please check manifest.json permissions.");
    }

    signinButton.disabled = true;
    signinButton.innerHTML = `
      <div class="button-spinner"></div>
      Signing in...
    `;

    // Runs in the worker; this promise never settles if the popup gets closed.
    const result = await chrome.runtime.sendMessage({ type: "SIGN_IN" });

    if (!result || !result.ok) {
      throw new Error((result && result.error) || "Sign-in failed.");
    }

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

async function handleSignOut() {
  try {
    await supabaseExtension.signOut();
    await gmailAuth.revoke();
  } catch (error) {
    console.error("Sign-out error:", error);
  } finally {
    currentUser = null;
    originalSelectedText = null;
    lastGeneratedContext = null;
    isEmailGenerated = false;
    lastExtracted = { name: "", company: "", title: "", email: "" };
    clearComposeFields();
    showSignInScreen();
  }
}

const showMainScreen = () => {
  if (signinScreen) signinScreen.style.display = "none";
  if (mainScreen) mainScreen.style.display = "block";

  if (currentUser && userAvatar && userName) {
    userAvatar.src = currentUser.picture || "icons/logo.png";
    userName.textContent = currentUser.name || "User";
  }
};

const showSignInScreen = () => {
  if (signinScreen) signinScreen.style.display = "block";
  if (mainScreen) mainScreen.style.display = "none";
  resetSignInButton();
};

const resetSignInButton = () => {
  if (signinButton) {
    signinButton.disabled = false;
    signinButton.innerHTML = `
      <svg class="google-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
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

// Read on demand under activeTab, so nothing is captured until Rakuun is opened.
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
    // Blocked on chrome:// pages, the Web Store, and PDF viewers.
    console.debug("Could not read the page selection:", error.message);
    return "";
  }
}

// Reachable from startup and from the storage listener, so it must not bind twice.
let mainAppInitialized = false;

const initializeMainApp = async () => {
  if (mainAppInitialized) return;
  mainAppInitialized = true;

  // Bound before the await so the UI responds while the selection loads.
  if (recipientEmail) recipientEmail.addEventListener("input", checkSendButtonState);
  if (subjectEmail) subjectEmail.addEventListener("input", checkSendButtonState);
  if (bodyInput) bodyInput.addEventListener("input", checkSendButtonState);
  if (contextSelect) contextSelect.addEventListener("change", handleContextChange);
  if (generateBtn) generateBtn.addEventListener("click", handleGenerateEmail);
  if (sendBtn) sendBtn.addEventListener("click", handleSendEmail);

  const selectedText = await readSelectionFromActiveTab();
  if (selectedText && bodyInput) {
    originalSelectedText = selectedText;
    bodyInput.value = selectedText;
    isEmailGenerated = false;
  }

  checkSendButtonState();
};

async function handleContextChange() {
  const newContext = contextSelect.value;

  if (isEmailGenerated && originalSelectedText && newContext !== lastGeneratedContext) {
    showOutput(`Updating email for ${getContextDisplayName(newContext)} context...`, "");
    await generateEmailWithContext(newContext);
  }
  checkSendButtonState();
}

const checkSendButtonState = () => {
  if (!recipientEmail || !subjectEmail || !bodyInput || !sendBtn) return;
  const hasEmail = recipientEmail.value.trim() !== "";
  const hasSubject = subjectEmail.value.trim() !== "";
  const hasBody = bodyInput.value.trim() !== "";

  sendBtn.disabled = !(hasEmail && hasSubject && hasBody);
};

function showOutput(message, type = "") {
  outputs.forEach((element) => {
    element.textContent = message;
    element.className = `output show ${type}`;
  });
}

function hideOutput() {
  outputs.forEach((element) => {
    element.className = "output";
  });
}

// Lets callers drop back to the sign-in screen instead of a generic error.
class SessionExpiredError extends Error {
  constructor() {
    super("Your session expired. Please sign in again.");
    this.name = "SessionExpiredError";
  }
}

// Bearer token lets the backend resolve auth.uid() rather than trust the body.
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

  generateBtn.classList.add("loading");
  generateBtn.disabled = true;
  showOutput("Generating your personalized email...");

  try {
    const res = await apiFetch("/api/generateEmail", { selectedText, context });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.email) {
      bodyInput.value = data.email;
      recipientEmail.value = data.to || "";
      subjectEmail.value = data.subject || "";

      isEmailGenerated = true;
      lastGeneratedContext = context;
      lastExtracted = {
        name: data.name || "",
        company: data.company || "",
        title: data.title || "",
        email: (data.to || "").trim().toLowerCase()
      };
      showOutput("Email generated successfully! You can edit it above.", "success");

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
    generateBtn.classList.remove("loading");
    generateBtn.disabled = false;
  }
}

// Chrome can hand back a token Google already revoked; the 401 is the only tell.
async function postEmail(payload, { allowRetry = true } = {}) {
  const gmailToken = await gmailAuth.getAccessToken();
  const res = await apiFetch("/api/sendEmail", { ...payload, userToken: gmailToken });

  if (res.status === 401 && allowRetry) {
    await gmailAuth.invalidate(gmailToken);
    return postEmail(payload, { allowRetry: false });
  }

  return { res, data: await res.json().catch(() => ({})) };
}

// Runs after the send. The mail has already left, so a failure here is reported
// but never turned into a failed send.
async function saveContact(to, subject) {
  const contactPayload = {
    email: to,
    source: "extension",
    raw_capture: {
      selected_text: originalSelectedText || null,
      context: lastGeneratedContext || null,
      subject
    }
  };

  // Only attach the extraction if the recipient is still the person it described.
  // Omitted rather than sent empty, so a blank never overwrites a known value.
  if (lastExtracted.email && lastExtracted.email === to.trim().toLowerCase()) {
    if (lastExtracted.name) contactPayload.name = lastExtracted.name;
    if (lastExtracted.company) contactPayload.company = lastExtracted.company;
    if (lastExtracted.title) contactPayload.title = lastExtracted.title;
  }

  const contactRes = await apiFetch("/api/contacts", contactPayload);
  if (!contactRes.ok) {
    const detail = await contactRes.json().catch(() => ({}));
    throw new Error(detail.error || `Contact save failed (${contactRes.status})`);
  }

  const contact = await contactRes.json();

  const interactionRes = await apiFetch(`/api/contacts/${contact.id}/interactions`, {
    type: "email_sent",
    payload: { subject, context: lastGeneratedContext || null }
  });
  if (!interactionRes.ok) {
    throw new Error(`Interaction log failed (${interactionRes.status})`);
  }

  return contact;
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

  sendBtn.classList.add("loading");
  sendBtn.disabled = true;
  showOutput("Sending email...");

  try {
    const { res, data } = await postEmail({ to, subject, body });

    if (res.ok && data.success) {
      showOutput("Email sent. Saving contact...", "success");
      try {
        await saveContact(to, subject);
        showOutput("Email sent and contact saved.", "success");
      } catch (saveError) {
        console.error("Contact save failed:", saveError);
        showOutput("Email sent, but saving the contact failed.", "error");
      }
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
    sendBtn.classList.remove("loading");
    checkSendButtonState();
  }
}

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
