document.getElementById("refresh-dashboard")?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return;
  }

  await chrome.tabs.sendMessage(tab.id, { type: "refresh-dashboard" });
  window.close();
});
