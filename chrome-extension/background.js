/**
 * background.js
 * Serviço de fundo do Manifest V3. Mantém a extensão leve, ouvindo ações do popup e preparando
 * a injeção do dashboard quando a página estiver ativa.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Avante Dashboard] Extensão instalada com sucesso.");
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle-dashboard" });
  }
});
