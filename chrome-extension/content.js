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
    const bodyText = (document.body?.innerText || "").toLowerCase();

    const avanteSignals = [
      hostname.includes("avante"),
      hostname.includes("codxis"),
      pathname.includes("avante"),
      title.includes("avante"),
      bodyText.includes("avante"),
      bodyText.includes("codxis"),
      bodyText.includes("dashboard")
    ];

    const matched = avanteSignals.some(Boolean);
    console.info("[Avante Dashboard] Diagnóstico de página.", {
      url: window.location.href,
      hostname,
      pathname,
      title,
      matched,
      signals: avanteSignals
    });

    return matched || Boolean(window.location.href);
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
      console.info("[Avante Dashboard] Bootstrap ignorado: dashboard já montado.");
      return;
    }

    try {
      console.info("[Avante Dashboard] Iniciando bootstrap do dashboard.", {
        url: window.location.href,
        readyState: document.readyState
      });

      await injectStylesheet();
      console.info("[Avante Dashboard] CSS do dashboard carregado.");

      await injectScript("network-inspector.js");
      console.info("[Avante Dashboard] network-inspector.js injetado no contexto da página.");

      await injectScript("api.js");
      console.info("[Avante Dashboard] api.js carregado no contexto do content script.");

      await injectScript("dashboard.js");
      console.info("[Avante Dashboard] dashboard.js carregado no contexto do content script.");

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

      console.info("[Avante Dashboard] Criando instância do dashboard.");
      dashboardInstance = new window.AvanteDashboardApp({ rootId: APP_ID });
      dashboardInstance.init();
      window.__avanteDashboardInstance = dashboardInstance;
    } catch (error) {
      console.error("[Avante Dashboard] Erro ao iniciar dashboard:", error);
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "refresh-dashboard") {
      const runRefresh = async () => {
        try {
          if (dashboardInstance) {
            await dashboardInstance.loadData(true);
          } else {
            await bootstrapDashboard();
          }

          sendResponse({ ok: true, source: "content-script" });
        } catch (error) {
          console.error("[Avante Dashboard] Erro ao atualizar dados:", error);
          sendResponse({ ok: false, error: error.message });
        }
      };

      runRefresh();
      return true;
    }

    if (message?.type === "toggle-dashboard") {
      if (dashboardInstance) {
        dashboardInstance.toggleDashboard();
      }
      sendResponse({ ok: true, source: "content-script" });
    }
  });

  if (isAvantePage()) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      console.info("[Avante Dashboard] Iniciando bootstrap pelo content script na página atual.");
      bootstrapDashboard();
    } else {
      console.info("[Avante Dashboard] Aguardando DOMContentLoaded para montar o dashboard.");
      window.addEventListener("DOMContentLoaded", () => {
        console.info("[Avante Dashboard] DOMContentLoaded recebido; montando dashboard.");
        bootstrapDashboard();
      }, { once: true });
    }
  }
})()
