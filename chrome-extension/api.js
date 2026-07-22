(() => {
  "use strict";

  /**
   * DataProvider
   * ├── ApiProvider
   * ├── DomProvider
   * └── TableProvider
   *
   * O dashboard consome apenas esta camada, sem saber de onde vieram os dados.
   * A prioridade é:
   * 1. APIs JSON descobertas automaticamente via fetch/XHR
   * 2. DOM da página
   * 3. Tabelas HTML
   */
  const DEBUG = true;
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
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === "string") {
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

  class HttpInspector {
    constructor({ debug = DEBUG } = {}) {
      this.debug = debug;
      this.requests = [];
      this.requestMap = new Map();
      this.selectedUrls = new Set();
      this.isPatched = false;
      this.fetchPatched = false;
      this.xhrPatched = false;
    }

    resolveUrl(input) {
      try {
        if (typeof input === "string") {
          return new URL(input, window.location.href).href;
        }

        if (input instanceof URL) {
          return input.href;
        }

        if (input instanceof Request) {
          return new URL(input.url, window.location.href).href;
        }

        return String(input || "");
      } catch {
        return String(input || "");
      }
    }

    shouldIgnore(url, contentType = "") {
      const normalized = String(url || "").toLowerCase();
      const isIgnoredExtension = IGNORE_EXTENSIONS.test(normalized);
      const isIgnoredContentType = /text\/css|application\/javascript|text\/javascript|font\//i.test(contentType);
      return isIgnoredExtension || isIgnoredContentType;
    }

    isJsonPayload(contentType = "", payload) {
      return Boolean(JSON_CONTENT_TYPES.test(contentType) || (payload !== null && typeof payload === "object"));
    }

    registerRequest({ method, url, status, duration, contentType, payload, responseText }) {
      const normalizedUrl = this.resolveUrl(url);
      if (this.shouldIgnore(normalizedUrl, contentType)) {
        return;
      }

      const isJson = this.isJsonPayload(contentType, payload);
      if (!isJson) {
        return;
      }

      const requestKey = `${method}|${normalizedUrl}`;
      const existing = this.requestMap.get(requestKey);
      const entry = {
        method,
        url: normalizedUrl,
        status,
        duration,
        contentType,
        payload,
        responseText,
        selected: true,
        updatedAt: new Date().toISOString()
      };

      if (existing) {
        entry.selected = existing.selected;
      }

      this.requestMap.set(requestKey, entry);
      this.requests = Array.from(this.requestMap.values());
      this.selectedUrls.add(normalizedUrl);

      if (this.debug) {
        console.groupCollapsed(`[Avante HTTP Inspector] ${method} ${normalizedUrl}`);
        console.info("Status:", status);
        console.info("Tempo:", `${duration.toFixed(1)}ms`);
        console.info("Content-Type:", contentType);
        console.info("Body JSON:", payload);
        console.groupEnd();
      }
    }

    patchFetch() {
      if (this.fetchPatched) {
        return;
      }

      const originalFetch = window.fetch?.bind(window);
      if (!originalFetch) {
        return;
      }

      window.fetch = async (...args) => {
        const startedAt = performance.now();
        const method = (args[1]?.method || "GET").toUpperCase();
        const url = this.resolveUrl(args[0]);

        try {
          const response = await originalFetch(...args);
          const contentType = response.headers?.get("content-type") || "";
          const responseText = await response.clone().text();
          const payload = safeParseJson(responseText, contentType);

          this.registerRequest({
            method,
            url,
            status: response.status,
            duration: performance.now() - startedAt,
            contentType,
            payload,
            responseText
          });

          return response;
        } catch (error) {
          if (this.debug) {
            logDebug("Erro ao interceptar fetch", { method, url, error });
          }
          throw error;
        }
      };

      this.fetchPatched = true;
    }

    patchXhr() {
      if (this.xhrPatched) {
        return;
      }

      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method, url) {
        this.__avanteStart = performance.now();
        this.__avanteMethod = method.toUpperCase();
        this.__avanteUrl = url;
        return originalOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function () {
        const xhr = this;

        xhr.addEventListener(
          "loadend",
          () => {
            const contentType = xhr.getResponseHeader("Content-Type") || "";
            const url = this.resolveUrl?.(xhr.__avanteUrl) || xhr.__avanteUrl || "";
            const method = xhr.__avanteMethod || "GET";
            const duration = performance.now() - (xhr.__avanteStart || performance.now());
            const payload = safeParseJson(xhr.responseText, contentType);

            if (!this.shouldIgnore(url, contentType)) {
              this.registerRequest({
                method,
                url,
                status: xhr.status,
                duration,
                contentType,
                payload,
                responseText: xhr.responseText
              });
            }
          }.bind(this),
          { once: true }
        );

        return originalSend.apply(this, arguments);
      }.bind(this);

      this.xhrPatched = true;
    }

    patchAll() {
      if (this.isPatched) {
        return;
      }

      this.patchFetch();
      this.patchXhr();
      this.isPatched = true;
    }

    getDiscoveredApis() {
      return this.requests.map((entry) => ({
        method: entry.method,
        url: entry.url,
        status: entry.status,
        duration: `${entry.duration.toFixed(1)}ms`,
        body: entry.payload,
        selected: entry.selected
      }));
    }

    toggleApiSelection(url, selected) {
      const normalizedUrl = this.resolveUrl(url);
      const record = this.requests.find((item) => item.url === normalizedUrl);
      if (record) {
        record.selected = selected;
      }

      if (selected) {
        this.selectedUrls.add(normalizedUrl);
      } else {
        this.selectedUrls.delete(normalizedUrl);
      }
    }
  }

  class ApiProvider {
    constructor({ debug = DEBUG } = {}) {
      this.debug = debug;
      this.inspector = new HttpInspector({ debug });
      this.inspector.patchAll();
      this.lastSource = "api";
    }

    getDiscoveredApis() {
      return this.inspector.getDiscoveredApis();
    }

    toggleApiSelection(url, selected) {
      this.inspector.toggleApiSelection(url, selected);
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
      const selectedEntries = this.inspector.requests.filter((request) => request.selected && request.payload);
      if (!selectedEntries.length) {
        return null;
      }

      const combined = selectedEntries.reduce(
        (acc, entry) => {
          const metrics = this.extractMetricFromPayload(entry.payload);
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
        logDebug("Dados capturados por ApiProvider", normalized);
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
        logDebug("Elementos HTML encontrados pelo DomProvider", {
          totalElements: document.querySelectorAll("div, span, td, th, button, input").length,
          preview: bodyText.slice(0, 300)
        });
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

      if (this.debug) {
        logDebug("Tabelas HTML encontradas pelo TableProvider", {
          tableCount: tables.length,
          metrics
        });
      }

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

    getDiscoveredApis() {
      return this.apiProvider.getDiscoveredApis();
    }

    toggleApi(url, selected) {
      this.apiProvider.toggleApiSelection(url, selected);
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
        logDebug("Tempo de atualização", {
          durationMs: Math.round(performance.now() - startedAt),
          source: selected.source,
          metrics: selected
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
