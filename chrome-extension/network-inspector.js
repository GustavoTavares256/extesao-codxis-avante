(() => {
  "use strict";

  /**
   * network-inspector.js
   *
   * Este script é injetado no contexto da página (MAIN world), não no isolated world do content script.
   * Por isso ele consegue interceptar fetch e XMLHttpRequest de forma mais confiável dentro do MV3.
   */
  if (window.__avanteNetworkInspectorInstalled) {
    return;
  }

  window.__avanteNetworkInspectorInstalled = true;

  const JSON_CONTENT_TYPES = /application\/json|text\/json|application\/ld\+json|application\/problem\+json/i;
  const IGNORE_EXTENSIONS = /(\.css|\.js|\.map|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.webp|\.woff|\.woff2|\.ttf|\.ico|\.pdf)(\?|$)/i;

  function normalizeUrl(url) {
    try {
      return new URL(String(url), window.location.href).href;
    } catch {
      return String(url || "");
    }
  }

  function isIgnored(url, contentType = "") {
    const normalized = String(url || "").toLowerCase();
    const ignoredByExtension = IGNORE_EXTENSIONS.test(normalized);
    const ignoredByType = /text\/css|application\/javascript|text\/javascript|font\//i.test(contentType);
    return ignoredByExtension || ignoredByType;
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

  function buildHeadersObject(headers) {
    if (!headers) {
      return {};
    }

    if (typeof headers.entries === "function") {
      const normalized = {};
      for (const [key, value] of headers.entries()) {
        normalized[key] = value;
      }
      return normalized;
    }

    if (typeof headers.forEach === "function") {
      const normalized = {};
      headers.forEach((value, key) => {
        normalized[key] = value;
      });
      return normalized;
    }

    return headers;
  }

  function getApproxSize(value) {
    if (typeof value === "string") {
      return new TextEncoder().encode(value).length;
    }

    if (value && typeof value === "object") {
      return new TextEncoder().encode(JSON.stringify(value)).length;
    }

    return 0;
  }

  function dispatchRequest(entry) {
    const normalizedUrl = normalizeUrl(entry.url);
    if (isIgnored(normalizedUrl, entry.contentType)) {
      return;
    }

    const payload = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toISOString(),
      method: entry.method || "GET",
      url: normalizedUrl,
      type: entry.jsonDetected ? "json" : "other",
      status: entry.status || 0,
      time: entry.time || 0,
      size: entry.size || 0,
      headers: entry.headers || {},
      jsonDetected: entry.jsonDetected,
      contentType: entry.contentType || ""
    };

    window.postMessage(
      {
        source: "avante-network-inspector",
        payload
      },
      "*"
    );
  }

  const originalFetch = window.fetch?.bind(window);
  if (originalFetch) {
    window.fetch = async (...args) => {
      const startedAt = performance.now();
      const method = (args[1]?.method || "GET").toUpperCase();
      const url = normalizeUrl(args[0]);

      try {
        const response = await originalFetch(...args);
        const headers = buildHeadersObject(response.headers);
        const contentType = headers["content-type"] || "";
        const responseText = await response.clone().text();
        const jsonDetected = safeParseJson(responseText, contentType);

        dispatchRequest({
          url,
          method,
          status: response.status,
          time: performance.now() - startedAt,
          headers,
          contentType,
          size: getApproxSize(responseText),
          jsonDetected
        });

        return response;
      } catch (error) {
        console.debug("[Avante Network Inspector] fetch error", error);
        throw error;
      }
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__avanteStart = performance.now();
    this.__avanteMethod = method?.toUpperCase() || "GET";
    this.__avanteUrl = normalizeUrl(url);
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const xhr = this;

    xhr.addEventListener(
      "loadend",
      () => {
        const contentType = xhr.getResponseHeader("Content-Type") || "";
        const url = xhr.__avanteUrl || "";
        const method = xhr.__avanteMethod || "GET";
        const jsonDetected = safeParseJson(xhr.responseText, contentType);

        dispatchRequest({
          url,
          method,
          status: xhr.status,
          time: performance.now() - (xhr.__avanteStart || performance.now()),
          headers: buildHeadersObject(xhr.getAllResponseHeaders ? xhr.getAllResponseHeaders() : {}),
          contentType,
          size: getApproxSize(xhr.responseText),
          jsonDetected
        });
      },
      { once: true }
    );

    return originalSend.apply(this, arguments);
  };
})();
