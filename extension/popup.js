document.addEventListener("DOMContentLoaded", () => {
  const bodyInput = document.getElementById("body");
  const recipientEmail = document.getElementById("to");
  const subjectEmail = document.getElementById("subject");
  const generateBtn = document.getElementById("generateBtn");
  const sendBtn = document.getElementById("sendBtn");
  const output = document.getElementById("output");

  // Load selected text from chrome.storage.local into textarea
  chrome.storage.local.get(["selectedText"], (result) => {
    if (result.selectedText) {
      bodyInput.value = result.selectedText;
    }
  });

  // Check if send button should be enabled
  function checkSendButtonState() {
    const hasEmail = recipientEmail.value.trim() !== "";
    const hasSubject = subjectEmail.value.trim() !== "";
    const hasBody = bodyInput.value.trim() !== "";
    
    sendBtn.disabled = !(hasEmail && hasSubject && hasBody);
  }

  // Add event listeners to enable send button when all fields are filled
  recipientEmail.addEventListener("input", checkSendButtonState);
  subjectEmail.addEventListener("input", checkSendButtonState);
  bodyInput.addEventListener("input", checkSendButtonState);

  // Show output with animation
  function showOutput(message, type = '') {
    output.textContent = message;
    output.className = `output show ${type}`;
  }

  // Hide output
  function hideOutput() {
    output.className = 'output';
  }

  generateBtn.addEventListener("click", async () => {
    const selectedText = bodyInput.value.trim();
    
    if (!selectedText) {
      showOutput("Please enter or select some text first.", "error");
      return;
    }

    // Start loading animation
    generateBtn.classList.add("loading");
    generateBtn.disabled = true;
    showOutput("Generating your personalized email...");

    try {
      const res = await fetch("http://localhost:3000/api/generateEmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedText }),
      });

      const data = await res.json();

      if (data.email) {
        // Replace textarea with generated email
        bodyInput.value = data.email; 
        // set subject field value with extarcted recipent's email
        recipientEmail.value = data.to || "";
        // set subject field value with generated subject
        subjectEmail.value = data.subject || "";
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
  });

  sendBtn.addEventListener("click", async () => {
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
      const res = await fetch("http://localhost:3000/api/sendEmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
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
  });
});