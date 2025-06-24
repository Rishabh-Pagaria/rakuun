let lastSelectedText = "";
document.addEventListener("mouseup", () => {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText !== lastSelectedText) {
    console.log("Selected text:", selectedText);
    lastSelectedText = selectedText;
    chrome.storage.local.set({ selectedText });
  }
});
