// const { init } = require("next/dist/compiled/webpack/webpack");

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
  // Initialize authentication first, because this will determine based on the session token if the user is logged in or not
  initializeAuthentication();
  });

  // The authentication flow 
  async function initializeAuthentication() {
    try {
      // check if user is already authenticated
      const result = await chrome.storage.local.get(['userToken', 'userInfo', 'tokenExpiry']);

      if (result.userToken && result.userInfo && result.tokenExpiry){
        const now = Date.now();
        if(now < result.tokenExpiry){
          // This block validates if there is still time for the token to expire then user gets authenticated and mainscreen is shown
          currentUser = result.userInfo;
          showMainScreen();
          initializeMainApp();
        } else{
          await clearAuthData();
          showSignInScreen();
        }
      }
      else{
        // If no user token is found, show sign-in screen
        showSignInScreen();
      }
    } catch (error){
      console.error("Error initializing authentication:", error);
      showSignInScreen();
    }

    // setting up event listeners for sign-in and sign-out buttons
    setupAuthEventListeners();
  }

  const setupAuthEventListeners = () => {
    if (signinButton) {
      signinButton.addEventListener("click", handleSignIn);
    }
    if (signoutButton) {
      signoutButton.addEventListener("click", handleSignOut);
    }
  }

  // handle Google sign-in process
  async function handleSignIn() {
    try {
      if (!chrome.identity) {
      throw new Error("Chrome Identity API is not available. Please check manifest.json permissions.");
    }
      
      console.log("Signing in...");

      // disables the button and shows loading animation
      signinButton.disabled = true;
      signinButton.innerHTML = `
      <div class="button-spinner"></div>
      Signing in...
      `;

      // chrome Identity API for OAuth
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({
          interactive: true,
          scopes:[
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/gmail.send'
        ]
        }, (token)=>{
          if (chrome.runtime.lastError){
            reject(new Error(chrome.runtime.lastError.message));
          }else{
            resolve(token);
          }
        });
      });

      // Fetch user info from Google People API
      const userInfo = await getUserInfo(token);

      // Token expiry set to 1 hour from now
      const tokenExpiry = Date.now() + 3600 * 1000;

      await chrome.storage.local.set({
        userToken: token,
        userInfo: userInfo,
        tokenExpiry: tokenExpiry
      });

      currentUser = userInfo;
      showMainScreen();
      initializeMainApp();
    } catch (error) {
      console.error("Sign-in error:", error);
      showOutput("Sign-in failed:" + error.message, "error");
      resetSignInButton();
    }
  }

  // Handling sign-out process
  async function handleSignOut(){
    try{
      const result = await chrome.storage.local.get(['userToken']);
      if(result.userToken){
        chrome.identity.removeCachedAuthToken({ token: result.userToken });
      }
      currentUser = null;
      showSignInScreen();
    } catch (error) {
      console.log("Sign-out error:", error);
    }
  }

  // Featch the user info from Google Api
  async function getUserInfo(token){
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok){
        throw new Error("Failed to fetch user info");
      }
      return await response.json();
    } catch (error) {
      throw new Error('Failed to get new user info:'+ error.message);
    }
  }

  // Clear authentication data from storage
  async function clearAuthData(){
    await chrome.storage.local.remove(['userToken', 'userInfo', 'tokenExpiry']);
  }

  // show main sccreen
  const showMainScreen = () => {
    if (signinScreen) signinScreen.style.display = "none";
    if (mainScreen) mainScreen.style.display = "block";

    // Update user info in the main screen
    if(currentUser && userAvatar && userName) {
      userAvatar.src = currentUser.picture || "default-avatar.png"; // Fallback to a default avatar if none provided
      userName.textContent = currentUser.name || "User";
    }
  }

  // show sign-in screen
  const showSignInScreen = () => {
    if (signinScreen) signinScreen.style.display = "block";
    if (mainScreen) mainScreen.style.display = "none";
    // Reset user info in the sign-in screen
    resetSignInButton();
  }

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
  }

  // Initialize the main application after authentication
  const initializeMainApp = () => {
    // Load selected text from chrome.storage.local into textarea
    chrome.storage.local.get(["selectedText"], (result) => {
      if (result.selectedText && bodyInput) {
        originalSelectedText = result.selectedText; // Store the original selected text
        bodyInput.value = result.selectedText; // Set the textarea value to the selected text
        isEmailGenerated = false;
      }
    });

    // Set up existing event listeners to enable send button when all fields are filled
    if (recipientEmail) recipientEmail.addEventListener("input", checkSendButtonState);
    if (subjectEmail) subjectEmail.addEventListener("input", checkSendButtonState);
    if (bodyInput) bodyInput.addEventListener("input", checkSendButtonState);
    if (contextSelect) contextSelect.addEventListener("change", handleContextChange);
    if (generateBtn) generateBtn.addEventListener("click", handleGenerateEmail);
    if (sendBtn) sendBtn.addEventListener("click", handleSendEmail);

    // Initial check for send button state
    checkSendButtonState();
  }

  // Handle context change event with automatic email generation
  async function handleContextChange() {
    const newContext = contextSelect.value;

    // checking if the context has changed and if the email is generated
    if(isEmailGenerated && originalSelectedText && newContext !== lastGeneratedContext){

      console.log(`Context changed from "${lastGeneratedContext}" to "${newContext}" - Auto-regenerating...`);
      // regeneration indicator
      showOutput(`Updating email for ${getContextDisplayName(newContext)} context...`,"");

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
  }

  // Show output with animation
  function showOutput(message, type = '') {
    if (output){
      output.textContent = message;
      output.className = `output show ${type}`;
    }
  }

  // Hide output
  function hideOutput() {
    if (output) output.className = 'output';
  }

  async function getCurrentUserToken(){
    const result = await chrome.storage.local.get(['userToken']);
    return result.userToken;
  }

  async function handleGenerateEmail(){
    // use original text if available, otherwise use the current body text value
    const selectedText = originalSelectedText || bodyInput.value.trim();
    const selectedContext = contextSelect.value;
    
    if (!selectedText) {
      showOutput("Please enter or select some text first.", "error");
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
      const userToken = await getCurrentUserToken();
      const res = await fetch("http://localhost:3000/api/generateEmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedText, userToken, context:context}),
      });

      const data = await res.json();

      if (data.email) {
        // Replace textarea with generated email
        bodyInput.value = data.email; 
        // set subject field value with extarcted recipent's email
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
      showOutput("Network error: " + err.message, "error");
    } finally {
      // Stop loading animation
      generateBtn.classList.remove("loading");
      generateBtn.disabled = false;
    }
  };

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
      const userToken = await getCurrentUserToken();
      const res = await fetch("http://localhost:3000/api/sendEmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body, userToken }),
      });

      const data = await res.json();

      if (data.success) {
        showOutput("Email sent successfully!", "success");
      } else {
        showOutput(data.error || "Failed to send email. Please try again.", "error");
      }
    } catch (err) {
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
        'job_application': 'Job application',
        'research_collaboration': 'Research collaboration', 
        'ta_application': 'TA application',
        'internship_inquiry': 'Internship inquiry',
        'networking': 'Professional networking',
        'phd_inquiry': 'PhD inquiry',
        'conference_meeting': 'Conference meeting',
        'guest_lecture': 'Guest lecture'
    };
    return names[context] || 'Professional';
  }

  // ✅ Add reset function if user wants to start over
function resetToOriginalText() {
    if (originalSelectedText) {
        bodyInput.value = originalSelectedText;
        isEmailGenerated = false;
        lastGeneratedContext = null;
        showOutput("Reset to original selected text.", "success");
    }
}