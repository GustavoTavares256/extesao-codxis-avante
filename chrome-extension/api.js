(() => {
  "use strict";

  /**
   * DataProvider
   * ├── ApiProvider
   * ├── DomProvider
   * └── TableProvider
   *
   * A estratégia real agora é:
   * 1. Descobrir endpoints via inspeção de rede no contexto da página
   * 2. Filtrar apenas JSON útil
   * 3. Deixar o usuário selecionar quais APIs alimentarão o dashboard
   * 4. Fallback para DOM e tabelas quando necessário
   */
  const DEBUG = true;
  const STORAGE_KEY = "avante-web-selected-endpoints";
  const JSON_CONTENT_TYPES = /application\/json|text\/json|application\/ld\+json|application\/problem\+json/i;
  const IGNORE_EXTENSIONS = /(\.css|\.js|\.map|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.webp|\.woff|\.woff2|\.ttf|\.ico|\.pdf)(\?|$)/i;

  function logDebug(message, payload) {
    if (!DEBUG) {
      return;
    }

    if (payload !== undefined) {
      console.debug(`[Avante DataProvider] ${message}`, payload);
      return;
    }

    console.debug(`[Avante DataProvider] ${message}`);
  }

  function normalizeNumber(value) {
    const type = typeof value;
    if (type === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    if (type === "string") {
      const cleaned = value
        .replace(/[^\d,.-]/g, "")
        .replace(/\./g, "")
        .replace(",", ".")
        .trim();

      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  function titleCase(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/(^|\s)([a-z])/g, (m) => m.toUpperCase());
  }

  function safeParseJson(value, contentType = "") {
    if (!value) {
      return null;
    }

    if (typeof value === "object") {
      return value;
    }

    if (typeof value !== "string") {
      return null;
    }

    const looksLikeJson = JSON_CONTENT_TYPES.test(contentType) || /^[\[{]/.test(value.trim());
    if (!looksLikeJson) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  class NetworkInspector {
    constructor({ debug = DEBUG } = {}) {
      this.debug = debug;
      this.requests = [];
      this.selectedUrls = new Set();
      this.requestMap = new Map();
      this.isReady = false;
      this.bindMessageListener();
      this.loadSelection();
    }

    bindMessageListener() {
      const handler = (event) => {
        if (!event?.data) {
          return;
        }

        if (event.data?.source === "avante-network-inspector") {
          this.captureRequest(event.data.payload);
          return;
        }

        if (event.data?.source === "avante-dashboard-selection-sync") {
          const stored = Array.isArray(event.data.payload) ? event.data.payload : [];
          stored.forEach((url) => this.selectedUrls.add(String(url)));
          this.isReady = true;
        }
      };

      window.addEventListener("message", handler, false);
    }

    loadSelection() {
      try {
        const serialized = window.localStorage?.getItem(STORAGE_KEY);
        if (serialized) {
          const stored = JSON.parse(serialized);
          if (Array.isArray(stored)) {
            stored.forEach((url) => this.selectedUrls.add(String(url)));
          }
        }
      } catch (error) {
        if (this.debug) {
          logDebug("Erro ao carregar endpoints salvos no localStorage", error);
        }
      }

      this.isReady = true;
    }

    async persistSelection() {
      try {
        const selection = Array.from(this.selectedUrls);
        if (window.localStorage) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
        }

        if (globalThis.chrome?.storage?.local) {
          await globalThis.chrome.storage.local.set({
            [STORAGE_KEY]: selection
          });
        }
      } catch (error) {
        if (this.debug) {
          logDebug("Erro ao persistir endpoints selecionados", error);
        }
      }
    }

    normalizeUrl(url) {
      try {
        return new URL(String(url), window.location.href).href;
      } catch {
        return String(url || "");
      }
    }

    shouldIgnore(url, contentType = "") {
      const normalized = String(url || "").toLowerCase();
      const ignoredExtension = IGNORE_EXTENSIONS.test(normalized);
      const ignoredContentType = /text\/css|application\/javascript|text\/javascript|font\//i.test(contentType);
      return ignoredExtension || ignoredContentType;
    }

    captureRequest(payload) {
      if (!payload || !payload.url || !payload.jsonDetected) {
        return;
      }

      const normalizedUrl = this.normalizeUrl(payload.url);
      if (this.shouldIgnore(normalizedUrl, payload.contentType)) {
        return;
      }

      const timestamp = payload.timestamp || new Date().toISOString();
      const record = {
        id: payload.id || `${timestamp}-${this.requests.length + 1}`,
        timestamp,
        method: payload.method || "GET",
        url: normalizedUrl,
        type: payload.type || "json",
        status: payload.status || 0,
        time: payload.time || 0,
        size: payload.size || 0,
        headers: payload.headers || {},
        json: payload.jsonDetected || null,
        selected: this.selectedUrls.has(normalizedUrl) || this.selectedUrls.size === 0
      };

      const requestKey = `${record.method}|${record.url}`;
      const existingIndex = this.requests.findIndex((item) => `${item.method}|${item.url}` === requestKey);
      if (existingIndex >= 0) {
        this.requests.splice(existingIndex, 1, record);
      } else {
        this.requests.unshift(record);
      }

      this.selectedUrls.add(normalizedUrl);
      this.persistSelection();

      if (this.debug) {
        logDebug("Requisição JSON descoberta", record);
      }
    }

    clearHistory() {
      this.requests = [];
      this.requestMap = new Map();
      this.selectedUrls = new Set();
      this.persistSelection();
    }

    getDiscoveredApis(filters = {}) {
      const list = this.requests
        .filter((item) => {
          if (filters.onlyJson && item.type !== "json") {
            return false;
          }

          if (filters.onlyGet && item.method !== "GET") {
            return false;
          }

          if (filters.onlyPost && item.method !== "POST") {
            return false;
          }

          if (filters.onlyApis && !/api|json|service|rest/i.test(item.url)) {
            return false;
          }

          if (filters.search) {
            const term = String(filters.search).toLowerCase();
            return item.url.toLowerCase().includes(term) || item.method.toLowerCase().includes(term);
          }

          return true;
        })
        .map((item) => ({
          ...item,
          selected: this.selectedUrls.has(item.url) || this.selectedUrls.size === 0
        }));

      return list;
    }

    setSelection(url, selected) {
      const normalized = this.normalizeUrl(url);
      if (selected) {
        this.selectedUrls.add(normalized);
      } else {
        this.selectedUrls.delete(normalized);
      }

      this.requests = this.requests.map((item) => ({
        ...item,
        selected: this.selectedUrls.has(item.url) || this.selectedUrls.size === 0
      }));

      this.persistSelection();
    }

    getSelectedRequests() {
      return this.requests.filter((item) => this.selectedUrls.has(item.url) || this.selectedUrls.size === 0);
    }
  }

  class ApiProvider {
    constructor({ debug = DEBUG } = {}) {
      this.debug = debug;
      this.inspector = new NetworkInspector({ debug });
      this.lastSource = "api";
    }

    getDiscoveredApis(filters = {}) {
      return this.inspector.getDiscoveredApis(filters);
    }

    toggleApi(url, selected) {
      this.inspector.setSelection(url, selected);
    }

    clearHistory() {
      this.inspector.clearHistory();
    }

    exportHistory() {
      return JSON.stringify(this.inspector.getDiscoveredApis(), null, 2);
    }

    extractMetricFromPayload(payload) {
      const out = {
        totalSales: 0,
        totalProductsSold: 0,
        totalProfit: 0,
        totalOrders: 0,
        salesTarget: 0,
        avgTicket: 0,
        bestProduct: "",
        salesTrend: [],
        salesByDay: [],
        categories: []
      };

      const flatten = [];
      const walk = (node) => {
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }

        if (!node || typeof node !== "object") {
          return;
        }

        Object.entries(node).forEach(([key, value]) => {
          if (typeof value === "number" || typeof value === "string") {
            flatten.push({ key: key.toLowerCase(), value });
          }
          walk(value);
        });
      };

      walk(payload);

      const numericByKeyword = (keywords) =>
        flatten
          .filter((item) => keywords.some((keyword) => item.key.includes(keyword)))
          .reduce((sum, item) => sum + normalizeNumber(item.value), 0);

      out.totalSales = numericByKeyword(["valor", "venda", "receita", "total"]);
      out.totalProductsSold = numericByKeyword(["quantidade", "produto", "item"]);
      out.totalProfit = numericByKeyword(["lucro", "profit", "margem"]);
      out.totalOrders = numericByKeyword(["pedido", "ordem", "order"]);
      out.salesTarget = numericByKeyword(["meta", "target", "objetivo"]);
      out.avgTicket = out.totalOrders > 0 ? out.totalSales / out.totalOrders : 0;

      const productName = flatten.find((item) => /produto|nome|item/.test(item.key) && typeof item.value === "string");
      if (productName) {
        out.bestProduct = titleCase(productName.value);
      }

      return out;
    }

    async collect() {
      const selectedEntries = this.inspector.getSelectedRequests();
      if (!selectedEntries.length) {
        return null;
      }

      const combined = selectedEntries.reduce(
        (acc, item) => {
          const payload = item.json || {};
          const metrics = this.extractMetricFromPayload(payload);
          acc.totalSales += metrics.totalSales;
          acc.totalProductsSold += metrics.totalProductsSold;
          acc.totalProfit += metrics.totalProfit;
          acc.totalOrders += metrics.totalOrders;
          acc.salesTarget += metrics.salesTarget;
          acc.avgTicket += metrics.avgTicket;
          if (!acc.bestProduct && metrics.bestProduct) {
            acc.bestProduct = metrics.bestProduct;
          }
          return acc;
        },
        {
          totalSales: 0,
          totalProductsSold: 0,
          totalProfit: 0,
          totalOrders: 0,
          salesTarget: 0,
          avgTicket: 0,
          bestProduct: ""
        }
      );

      const normalized = {
        ...combined,
        avgTicket: combined.totalOrders > 0 ? combined.totalSales / combined.totalOrders : 0,
        source: "api",
        lastUpdated: new Date().toISOString()
      };

      if (this.debug) {
        logDebug("Dados combinados através das APIs selecionadas", normalized);
      }

      return normalized;
    }
  }

  class DomProvider {
    constructor({ debug = DEBUG } = {}) {
      this.debug = debug;
    }

    extractFromText(pattern, text) {
      const match = text.match(pattern);
      if (!match) {
        return 0;
      }

      return normalizeNumber(match[1] || match[0]);
    }

    extractBestProduct(text) {
      const match = text.match(/produto(?:\s+mais\s+vendido)?[^\n]{0,80}([A-Za-zÀ-ÿ0-9\s\-]+)/i);
      return match ? titleCase(match[1].trim()) : "";
    }

    collect() {
      const bodyText = document.body?.innerText || "";
      const metrics = {
        totalSales: this.extractFromText(/(?:valor|venda|receita).*?([\d.,]+)/i, bodyText),
        totalOrders: this.extractFromText(/(?:pedido|ordens).*?([\d.,]+)/i, bodyText),
        totalProductsSold: this.extractFromText(/(?:produto|quantidade).*?([\d.,]+)/i, bodyText),
        totalProfit: this.extractFromText(/(?:lucro|profit).*?([\d.,]+)/i, bodyText),
        salesTarget: this.extractFromText(/(?:meta|objetivo).*?([\d.,]+)/i, bodyText),
        avgTicket: this.extractFromText(/(?:ticket).*?([\d.,]+)/i, bodyText),
        bestProduct: this.extractBestProduct(bodyText),
        source: "dom",
        lastUpdated: new Date().toISOString()
      };

      if (this.debug) {
        logDebug("Dados capturados via DOM", metrics);
      }

      return metrics.totalSales || metrics.totalOrders || metrics.totalProductsSold ? metrics : null;
    }
  }

  class TableProvider {
    constructor({ debug = DEBUG } = {}) {
      this.debug = debug;
    }

    collect() {
      const tables = Array.from(document.querySelectorAll("table"));
      if (!tables.length) {
        return null;
      }

      const metrics = {
        totalSales: 0,
        totalProductsSold: 0,
        totalProfit: 0,
        totalOrders: 0,
        salesTarget: 0,
        avgTicket: 0,
        bestProduct: "",
        salesTrend: [],
        salesByDay: [],
        categories: [],
        source: "table",
        lastUpdated: new Date().toISOString()
      };

      tables.forEach((table) => {
        const rows = Array.from(table.querySelectorAll("tr"));

        rows.forEach((row) => {
          const cells = Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent?.trim() || "");
          if (!cells.length) {
            return;
          }

          const joined = cells.join(" ").toLowerCase();
          const amount = normalizeNumber(cells.find((cell) => /\d/.test(cell)) || "0");

          if (/venda|valor|receita|total/.test(joined)) {
            metrics.totalSales += amount;
          }

          if (/pedido|ordem/.test(joined)) {
            metrics.totalOrders += 1;
          }

          if (/produto|qtd|quantidade/.test(joined)) {
            metrics.totalProductsSold += amount;
          }

          if (/lucro|profit/.test(joined)) {
            metrics.totalProfit += amount;
          }

          if (/meta|objetivo/.test(joined)) {
            metrics.salesTarget += amount;
          }

          if ((/produto|item/.test(joined)) && cells.length > 1) {
            const productText = cells.find((cell) => /[a-z]/i.test(cell)) || "";
            if (productText) {
              metrics.bestProduct = metrics.bestProduct || titleCase(productText);
            }
          }
        });
      });

      metrics.avgTicket = metrics.totalOrders > 0 ? metrics.totalSales / metrics.totalOrders : 0;
      return metrics.totalSales || metrics.totalOrders || metrics.totalProductsSold ? metrics : null;
    }
  }

  class DataProvider {
    constructor({ debug = DEBUG } = {}) {
      this.debug = debug;
      this.apiProvider = new ApiProvider({ debug });
      this.domProvider = new DomProvider({ debug });
      this.tableProvider = new TableProvider({ debug });
    }

    getDiscoveredApis(filters = {}) {
      return this.apiProvider.getDiscoveredApis(filters);
    }

    toggleApi(url, selected) {
      this.apiProvider.toggleApi(url, selected);
    }

    clearHistory() {
      this.apiProvider.clearHistory();
    }

    exportHistory() {
      return this.apiProvider.exportHistory();
    }

    async getDashboardData() {
      const startedAt = performance.now();

      const [apiResult, domResult, tableResult] = await Promise.allSettled([
        this.apiProvider.collect(),
        this.domProvider.collect(),
        this.tableProvider.collect()
      ]);

      const availableResults = [
        apiResult.status === "fulfilled" ? apiResult.value : null,
        domResult.status === "fulfilled" ? domResult.value : null,
        tableResult.status === "fulfilled" ? tableResult.value : null
      ].filter(Boolean);

      const selected =
        availableResults.find((item) => item.source === "api") ||
        availableResults.find((item) => item.source === "dom") ||
        availableResults.find((item) => item.source === "table") ||
        this.buildFallbackData();

      if (this.debug) {
        logDebug("Tempo de atualização do provider", {
          durationMs: Math.round(performance.now() - startedAt),
          source: selected.source
        });
      }

      return {
        ...selected,
        lastUpdated: new Date().toISOString(),
        salesTrend: selected.salesTrend?.length ? selected.salesTrend : [12_000, 16_000, 14_500, 18_200, 19_400, 23_400, 25_700],
        salesByDay: selected.salesByDay?.length ? selected.salesByDay : [
          { day: "Seg", value: 22000 },
          { day: "Ter", value: 24500 },
          { day: "Qua", value: 28900 },
          { day: "Qui", value: 31500 },
          { day: "Sex", value: 28000 },
          { day: "Sáb", value: 26000 },
          { day: "Dom", value: 23000 }
        ],
        categories: selected.categories?.length ? selected.categories : [
          { label: "Eletrônicos", value: 38 },
          { label: "Acessórios", value: 24 },
          { label: "Casa", value: 18 },
          { label: "Escritório", value: 20 }
        ]
      };
    }

    buildFallbackData() {
      return {
        totalSales: 0,
        totalProductsSold: 0,
        totalProfit: 0,
        totalOrders: 0,
        salesTarget: 0,
        avgTicket: 0,
        bestProduct: "Nenhum produto identificado",
        salesTrend: [],
        salesByDay: [],
        categories: [],
        source: "fallback",
        lastUpdated: new Date().toISOString()
      };
    }
  }

  window.AvanteDataProvider = new DataProvider({ debug: DEBUG });
  window.AvanteDashboardApi = window.AvanteDataProvider;
})();
