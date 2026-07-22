const statusNode = document.getElementById("refresh-status");
const metaInput = document.getElementById("meta-monthly");
const themeSelect = document.getElementById("theme-mode");
const autoRefreshInput = document.getElementById("auto-refresh");
const indicatorToggles = Array.from(document.querySelectorAll(".indicator-toggle"));

function updateStatus(message) {
  if (!statusNode) {
    return;
  }

  statusNode.textContent = message;
  statusNode.style.display = "block";
}

async function loadSettings() {
  const result = await chrome.storage.sync.get({
    metaMonthly: null,
    theme: "dark",
    autoRefresh: true,
    indicatorsVisible: []
  });

  if (metaInput) {
    metaInput.value = result.metaMonthly ?? "";
  }

  if (themeSelect) {
    themeSelect.value = result.theme || "dark";
  }

  if (autoRefreshInput) {
    autoRefreshInput.checked = Boolean(result.autoRefresh);
  }

  const visibleIndicators = new Set(Array.isArray(result.indicatorsVisible) ? result.indicatorsVisible : []);
  indicatorToggles.forEach((toggle) => {
    toggle.checked = visibleIndicators.has(toggle.value);
  });
}

async function saveSettings() {
  const selectedIndicators = indicatorToggles
    .filter((toggle) => toggle.checked)
    .map((toggle) => toggle.value);

  await chrome.storage.sync.set({
    metaMonthly: Number(metaInput?.value || 0),
    theme: themeSelect?.value || "dark",
    autoRefresh: Boolean(autoRefreshInput?.checked),
    indicatorsVisible: selectedIndicators
  });

  updateStatus("Configurações salvas.");
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

document.getElementById("save-settings")?.addEventListener("click", async () => {
  await saveSettings();
});

loadSettings();

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
