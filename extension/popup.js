document.getElementById("generateBtn").onclick = async () => {
  const { selectedText } = await chrome.storage.local.get("selectedText");
  document.getElementById("output").textContent = `Generating email for:\n\n"${selectedText}"`;
  if (!selectedText) {
    document.getElementById("output").textContent =
      "Please select some text before clicking generate.";
    return;
  }

  const response = await fetch("http://localhost:3000/api/generateEmail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedText }),
  });

  const data = await response.json();
  document.getElementById("output").textContent = data.email;
  
};
