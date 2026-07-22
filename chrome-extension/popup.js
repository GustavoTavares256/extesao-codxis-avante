const statusNode = document.getElementById("refresh-status");

function updateStatus(message) {
  if (!statusNode) {
    return;
  }

  statusNode.textContent = message;
  statusNode.style.display = "block";
}

async function retryRefresh(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });

    const response = await chrome.tabs.sendMessage(tabId, { type: "refresh-dashboard" });
    console.log("[Avante Popup] Resposta após reinjeção:", response);
    updateStatus(response?.ok ? "Dados atualizados com sucesso." : "Falha ao atualizar os dados.");
  } catch (error) {
    console.error("[Avante Popup] Falha ao reinjetar o content script:", error);
    updateStatus("Não foi possível se comunicar com o dashboard da página.");
  }
}

document.getElementById("refresh-dashboard")?.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      updateStatus("Nenhuma aba ativa encontrada.");
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "refresh-dashboard" });
    console.log("[Avante Popup] Resposta do dashboard:", response);
    updateStatus(response?.ok ? "Dados atualizados com sucesso." : "Falha ao atualizar os dados.");
  } catch (error) {
    console.error("[Avante Popup] Falha ao atualizar dashboard:", error);
    updateStatus("Não foi possível se comunicar com o dashboard da página. Tentando reinjetar...");

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await retryRefresh(tab.id);
      }
    } catch (retryError) {
      console.error("[Avante Popup] Reinjeção falhou:", retryError);
      updateStatus("O dashboard não respondeu mesmo após reinjeção.");
    }
  }
});
