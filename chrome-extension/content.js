(() => {
  "use strict";

  /**
   * Content Script responsável apenas por detectar se a página pertence ao sistema Avante Web
   * e, em seguida, injetar o painel de dashboard sem alterar o layout original.
   */
  const APP_ID = "avante-web-dashboard-root";
  let dashboardInstance = null;

  function isAvantePage() {
    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();
    const title = document.title.toLowerCase();

    return (
      hostname.includes("avante") ||
      hostname.includes("codxis") ||
      pathname.includes("avante") ||
      title.includes("avante")
    );
  }

  function injectScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-avante-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === "true") {
          resolve();
          return;
        }
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(src);
      script.dataset.avanteSrc = src;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function injectStylesheet() {
    if (document.querySelector('link[data-avante-dashboard="true"]')) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("style.css");
      link.dataset.avanteDashboard = "true";
      link.onload = resolve;
      link.onerror = () => reject(new Error("Falha ao carregar o CSS do dashboard"));
      (document.head || document.documentElement).appendChild(link);
    });
  }

  async function bootstrapDashboard() {
    if (document.getElementById(APP_ID)) {
      return;
    }

    try {
      await injectStylesheet();
      await injectScript("network-inspector.js");
      await injectScript("api.js");
      await injectScript("dashboard.js");

      const storedSelection = await chrome.storage.local.get("avante-web-selected-endpoints");
      const selectedEndpoints = Array.isArray(storedSelection["avante-web-selected-endpoints"])
        ? storedSelection["avante-web-selected-endpoints"]
        : [];

      window.postMessage(
        {
          source: "avante-dashboard-selection-sync",
          payload: selectedEndpoints
        },
        "*"
      );

      if (!window.AvanteDashboardApp) {
        console.warn("[Avante Dashboard] Dashboard JS não foi carregado corretamente.");
        return;
      }

      dashboardInstance = new window.AvanteDashboardApp({ rootId: APP_ID });
      dashboardInstance.init();
      window.__avanteDashboardInstance = dashboardInstance;
    } catch (error) {
      console.error("[Avante Dashboard] Erro ao iniciar dashboard:", error);
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "refresh-dashboard") {
      if (dashboardInstance) {
        dashboardInstance.loadData(true);
      } else {
        bootstrapDashboard();
      }
    }

    if (message?.type === "toggle-dashboard") {
      if (dashboardInstance) {
        dashboardInstance.toggleDashboard();
      }
    }
  });

  if (isAvantePage()) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      bootstrapDashboard();
    } else {
      window.addEventListener("DOMContentLoaded", bootstrapDashboard, { once: true });
    }
  }
})();
