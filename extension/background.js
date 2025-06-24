chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "TEXT_SELECTED") {
    chrome.storage.local.set({ selectedText: message.text });
  }
});
