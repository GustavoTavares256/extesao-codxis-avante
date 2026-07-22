document.getElementById("refresh-dashboard")?.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "refresh-dashboard" });
    console.log("[Avante Popup] Resposta do dashboard:", response);
  } catch (error) {
    console.error("[Avante Popup] Falha ao atualizar dashboard:", error);
  } finally {
    window.close();
  }
});
