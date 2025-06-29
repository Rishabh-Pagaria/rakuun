document.addEventListener("DOMContentLoaded", () => {
  const bodyInput = document.getElementById("body");
  const generateBtn = document.getElementById("generateBtn");
  const output = document.getElementById("output");

  // Load selected text from chrome.storage.local into textarea
  chrome.storage.local.get(["selectedText"], (result) => {
    if (result.selectedText) {
      bodyInput.value = result.selectedText;
    }
  });

  generateBtn.addEventListener("click", async () => {
    const selectedText = bodyInput.value.trim();
    if (!selectedText) {
      output.textContent = "Please enter or select some text first.";
      return;
    }
    output.textContent = "Generating email...";
    try {
      const res = await fetch("http://localhost:3000/api/generateEmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedText }),
      });
      const data = await res.json();
      if (data.email) {
        bodyInput.value = data.email; // Replace textarea with generated email
        output.textContent = "Email generated!";
      } else {
        output.textContent = data.error || "Failed to generate email.";
      }
    } catch (err) {
      output.textContent = "Error: " + err.message;
    }
  });
});