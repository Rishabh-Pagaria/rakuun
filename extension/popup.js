document.addEventListener("DOMContentLoaded", () => {
  const bodyInput = document.getElementById("body");
  const recipientEmail = document.getElementById("to");
  const subjectEmail = document.getElementById("subject");
  const generateBtn = document.getElementById("generateBtn");
  const output = document.getElementById("output");

  // Load selected text from chrome.storage.local into textarea
  chrome.storage.local.get(["selectedText"], (result) => {
    if (result.selectedText) {
      bodyInput.value = result.selectedText;
    }
  });

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
});