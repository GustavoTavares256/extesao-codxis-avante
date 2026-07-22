(() => {
  "use strict";

  /**
   * Dashboard monta toda a interface visual, cards de indicadores, gráficos e controles de interação.
   * A ideia é manter o render separado da camada de dados para facilitar manutenção e evolução.
   */
  class AvanteDashboardApp {
    constructor({ rootId = "avante-web-dashboard-root" } = {}) {
      this.rootId = rootId;
      this.metricsService = window.AvanteMetricsService || window.AvanteDashboardApi;
      this.api = this.metricsService;
      this.intervalId = null;
      this.chartInstances = {};
      this.initialized = false;
      this.mountObserver = null;
      this.rootElement = null;
      this.anchorElement = null;
    }

    async init() {
      if (this.initialized) {
        return;
      }

      this.initialized = true;
      this.mountDashboard();
      this.renderSkeleton();
      await this.loadData();
      this.intervalId = window.setInterval(() => this.loadData(true), 30000);
    }

    async refresh() {
      await this.loadData(true);
    }

    mountDashboard() {
      const existing = document.getElementById(this.rootId);
      if (existing) {
        this.rootElement = existing;
        const toggleButton = existing.querySelector("#avante-dashboard-toggle");
        if (toggleButton && !toggleButton.dataset.bound) {
          toggleButton.addEventListener("click", () => this.toggleDashboard());
          toggleButton.dataset.bound = "true";
        }
        this.startMountObserver();
        return;
      }

      const host = document.createElement("div");
      host.id = this.rootId;
      host.className = "avante-dashboard-host avante-dashboard-shell";
      host.innerHTML = `
        <div class="avante-dashboard-panel">
          <div class="avante-dashboard-header">
            <div>
              <span class="avante-badge">Avante Web</span>
              <h2>Dashboard Executivo Premium</h2>
            </div>
            <div class="avante-header-actions">
              <button class="avante-toggle-btn" id="avante-dashboard-toggle" aria-label="Recolher dashboard">▾</button>
            </div>
          </div>
          <div class="avante-dashboard-body" id="avante-dashboard-body">
            <div class="avante-dashboard-filters">
              <button class="avante-filter-pill active">Hoje</button>
              <button class="avante-filter-pill">Ontem</button>
              <button class="avante-filter-pill">Semana</button>
              <button class="avante-filter-pill">Mês</button>
              <button class="avante-filter-pill">Ano</button>
              <button class="avante-filter-pill">Personalizado</button>
            </div>
            <div class="avante-dashboard-grid" id="avante-dashboard-metrics"></div>
            <div class="avante-dashboard-charts">
              <div class="avante-chart-card">
                <div class="avante-chart-title">Vendas por dia</div>
                <canvas id="chart-sales-by-day"></canvas>
              </div>
              <div class="avante-chart-card">
                <div class="avante-chart-title">Categorias mais vendidas</div>
                <canvas id="chart-categories"></canvas>
              </div>
              <div class="avante-chart-card avante-chart-card-wide">
                <div class="avante-chart-title">Evolução das vendas</div>
                <canvas id="chart-sales-trend"></canvas>
              </div>
            </div>
            <div class="avante-dashboard-bottom-grid">
              <div class="avante-alerts-card">
                <div class="avante-section-title">Alertas</div>
                <div class="avante-alert-list">
                  <div class="avante-alert-item danger">🔴 Estoque baixo</div>
                  <div class="avante-alert-item warning">🟡 Meta abaixo do esperado</div>
                  <div class="avante-alert-item success">🟢 Crescimento nas vendas</div>
                  <div class="avante-alert-item info">🔵 Caixa positivo</div>
                  <div class="avante-alert-item accent">🟠 Produtos sem venda</div>
                </div>
              </div>
              <div class="avante-rankings-card">
                <div class="avante-section-title">Top rankings</div>
                <div class="avante-rankings-grid">
                  <div class="avante-ranking-box"><strong>Top 10 produtos</strong><span>Aguardando integração...</span></div>
                  <div class="avante-ranking-box"><strong>Top clientes</strong><span>Dados indisponíveis.</span></div>
                  <div class="avante-ranking-box"><strong>Top vendedores</strong><span>Dados indisponíveis.</span></div>
                  <div class="avante-ranking-box"><strong>Top categorias</strong><span>Dados indisponíveis.</span></div>
                  <div class="avante-ranking-box"><strong>Top formas de pagamento</strong><span>Dados indisponíveis.</span></div>
                </div>
              </div>
            </div>
            <div class="avante-debug-panel" id="avante-debug-panel">
              <div class="avante-debug-header">
                <strong>Modo de depuração</strong>
                <span>APIs JSON descobertas automaticamente</span>
              </div>
              <div class="avante-debug-list" id="avante-debug-list"></div>
            </div>
          </div>
        </div>
      `;

      this.rootElement = host;
      this.placeDashboardHost(host);

      const toggleButton = host.querySelector("#avante-dashboard-toggle");
      if (toggleButton) {
        toggleButton.addEventListener("click", () => this.toggleDashboard());
      }

      this.startMountObserver();
    }

    findMountAnchor() {
      const selectors = [
        "header",
        "[role='banner']",
        ".app-header",
        ".main-header",
        ".topbar",
        ".navbar",
        ".header",
        ".layout-header"
      ];

      for (const selector of selectors) {
        const found = document.querySelector(selector);
        if (found && found.isConnected) {
          return found;
        }
      }

      return document.body?.firstElementChild || document.body;
    }

    placeDashboardHost(host) {
      const anchor = this.findMountAnchor();
      if (anchor && anchor.parentNode && anchor !== host) {
        anchor.insertAdjacentElement("afterend", host);
        return;
      }

      if (document.body && !host.isConnected) {
        document.body.appendChild(host);
      }
    }

    startMountObserver() {
      if (this.mountObserver || !document.body) {
        return;
      }

      this.mountObserver = new MutationObserver(() => {
        this.placeDashboardHost(this.rootElement);
      });

      this.mountObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    renderSkeleton() {
      const metricsContainer = document.getElementById("avante-dashboard-metrics");
      if (!metricsContainer) {
        return;
      }

      metricsContainer.innerHTML = [
        "sales", "products", "profit", "orders", "goal", "ticket"
      ]
        .map(() => `
          <div class="avante-card avante-skeleton-card">
            <div class="avante-skeleton-line short"></div>
            <div class="avante-skeleton-line"></div>
            <div class="avante-skeleton-line"></div>
          </div>
        `)
        .join("");
    }

    async loadData(isRefresh = false) {
      try {
        const data = await this.api.getDashboardData();

        if (data?.status === "empty") {
          this.showEmptyState(data.reason || "Fonte de dados não encontrada.");
          this.renderDebugPanel();
          return;
        }

        this.updateMetrics(data);
        this.renderDebugPanel();
        await this.ensureChartsLoaded();
        this.renderCharts(data);

        if (isRefresh) {
          this.animateRefresh();
        }
      } catch (error) {
        console.error("[Avante Dashboard] Erro ao buscar dados:", error);
        this.showEmptyState("Erro de execução do DataProvider: " + error.message);
      }
    }

    updateMetrics(data) {
      const incoming = Number(data.totalSales || 0);
      const profit = Number(data.totalProfit || 0);
      const outgoing = Math.max(incoming - profit, 0);
      const target = Number(data.metaMonthly || data.salesTarget || 0);
      const orders = Number(data.totalOrders || 0);
      const products = Number(data.totalProductsSold || 0);
      const customers = Number(data.totalCustomers || 0);
      const progress = target > 0 ? Math.min((incoming / target) * 100, 100) : 0;
      const revenueState = incoming > 0 ? this.formatValue(incoming, "currency") : "Aguardando integração...";
      const profitState = profit > 0 ? this.formatValue(profit, "currency") : "Dados indisponíveis.";
      const salesState = orders > 0 ? this.formatValue(orders, "number") : "Dados indisponíveis.";
      const productsState = products > 0 ? this.formatValue(products, "number") : "Dados indisponíveis.";
      const customersState = customers > 0 ? this.formatValue(customers, "number") : "Dados indisponíveis.";
      const champion = data.bestProduct || "Aguardando integração...";
      const targetState = target > 0 ? this.formatValue(target, "currency") : "Aguardando integração...";
      const lastUpdated = data.lastUpdated ? new Date(data.lastUpdated).toLocaleString("pt-BR") : "Aguardando integração...";

      const metrics = [
        { label: "💰 Entradas", value: revenueState },
        { label: "💸 Saídas", value: this.formatValue(outgoing, "currency") },
        { label: "📈 Lucro", value: profitState },
        { label: "🛒 Vendas", value: salesState },
        { label: "📦 Produtos vendidos", value: productsState },
        { label: "📋 Pedidos", value: this.formatValue(orders, "number") },
        { label: "👥 Clientes", value: customersState },
        { label: "🏆 Produto campeão", value: champion },
        { label: "🎯 Meta do mês", value: targetState },
        { label: "📊 Progresso de vendas", value: this.formatValue(progress, "percent") }
      ];

      const container = document.getElementById("avante-dashboard-metrics");
      if (!container) {
        return;
      }

      container.innerHTML = metrics
        .map((item, index) => `
          <div class="avante-card avante-card-animated avante-card-${index + 1}">
            <div class="avante-card-label">${item.label}</div>
            <div class="avante-card-value">${item.value}</div>
            ${item.label === "🎯 Meta do mês" ? this.renderProgressBar(target, incoming) : ""}
          </div>
        `)
        .join("");

      const timestamp = document.createElement("div");
      timestamp.className = "avante-last-update";
      timestamp.innerHTML = `🕒 Última atualização: ${lastUpdated}`;
      container.appendChild(timestamp);
    }

    renderProgressBar(target, currentValue) {
      const safeTarget = Number(target || 0);
      const safeCurrent = Number(currentValue || 0);
      const progress = safeTarget > 0 ? Math.min((safeCurrent / safeTarget) * 100, 100) : 0;

      return `
        <div class="avante-progress-wrap">
          <div class="avante-progress-track">
            <div class="avante-progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="avante-progress-label">${progress.toFixed(1)}% da meta</div>
        </div>
      `;
    }

    formatValue(value, type) {
      const normalized = Number(value || 0);

      switch (type) {
        case "currency":
          return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL"
          }).format(normalized || 0);
        case "number":
          return new Intl.NumberFormat("pt-BR").format(normalized || 0);
        case "progress":
          return `${new Intl.NumberFormat("pt-BR").format(normalized || 0)} / meta`;
        case "percent":
          return `${normalized.toFixed(1)}%`;
        case "text":
          return value || "Aguardando dados...";
        default:
          return value ?? "Aguardando dados...";
      }
    }

    renderDebugPanel() {
      const list = document.getElementById("avante-debug-list");
      if (!list || typeof this.api.getDiscoveredApis !== "function") {
        return;
      }

      const apis = this.api.getDiscoveredApis();
      if (!apis.length) {
        list.innerHTML = '<div class="avante-debug-empty">Nenhuma API JSON descoberta ainda.</div>';
        return;
      }

      list.innerHTML = apis
        .map((api) => {
          const checked = api.selected ? "checked" : "";
          const bodyPreview = api.body ? JSON.stringify(api.body).slice(0, 120) : "{}";
          return `
            <label class="avante-debug-item">
              <input type="checkbox" class="avante-debug-checkbox" data-url="${api.url}" ${checked} />
              <span class="avante-debug-method">${api.method}</span>
              <span class="avante-debug-url">${api.url}</span>
              <span class="avante-debug-status">${api.status}</span>
              <span class="avante-debug-duration">${api.time || api.duration || 0} ms</span>
              <code class="avante-debug-body">${bodyPreview}</code>
            </label>
          `;
        })
        .join("");

      list.querySelectorAll(".avante-debug-checkbox").forEach((checkbox) => {
        checkbox.addEventListener("change", (event) => {
          const { url } = event.target.dataset;
          const isSelected = event.target.checked;
          this.api.toggleApi?.(url, isSelected);
          this.loadData(true);
        });
      });
    }

    async ensureChartsLoaded() {
      if (window.Chart) {
        return;
      }

      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js";
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Falha ao carregar Chart.js"));
        (document.head || document.documentElement).appendChild(script);
      });
    }

    renderCharts(data) {
      if (!window.Chart) {
        return;
      }

      const barCtx = document.getElementById("chart-sales-by-day");
      const pieCtx = document.getElementById("chart-categories");
      const lineCtx = document.getElementById("chart-sales-trend");

      if (!barCtx || !pieCtx || !lineCtx) {
        return;
      }

      this.destroyCharts();

      this.chartInstances.salesByDay = new Chart(barCtx, {
        type: "bar",
        data: {
          labels: data.salesByDay.map((item) => item.day),
          datasets: [
            {
              label: "Vendas por dia",
              data: data.salesByDay.map((item) => item.value),
              borderRadius: 12,
              backgroundColor: ["#7c3aed", "#8b5cf6", "#6366f1", "#4f46e5", "#22c55e", "#06b6d4", "#3b82f6"]
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              ticks: { color: "#94a3b8" },
              grid: { color: "rgba(255,255,255,0.05)" }
            },
            x: {
              ticks: { color: "#cbd5e1" },
              grid: { display: false }
            }
          }
        }
      });

      this.chartInstances.categories = new Chart(pieCtx, {
        type: "pie",
        data: {
          labels: data.categories.map((item) => item.label),
          datasets: [
            {
              data: data.categories.map((item) => item.value),
              backgroundColor: ["#8b5cf6", "#06b6d4", "#22c55e", "#f59e0b"]
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: "#e2e8f0"
              }
            }
          }
        }
      });

      this.chartInstances.salesTrend = new Chart(lineCtx, {
        type: "line",
        data: {
          labels: Array.from({ length: data.salesTrend.length }, (_, index) => `M${index + 1}`),
          datasets: [
            {
              label: "Evolução das vendas",
              data: data.salesTrend,
              borderColor: "#34d399",
              backgroundColor: "rgba(52, 211, 153, 0.15)",
              fill: true,
              tension: 0.35
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              ticks: { color: "#94a3b8" },
              grid: { color: "rgba(255,255,255,0.05)" }
            },
            x: {
              ticks: { color: "#cbd5e1" },
              grid: { display: false }
            }
          }
        }
      });
    }

    destroyCharts() {
      Object.values(this.chartInstances).forEach((chart) => {
        if (chart && typeof chart.destroy === "function") {
          chart.destroy();
        }
      });
      this.chartInstances = {};
    }

    toggleDashboard() {
      const body = document.getElementById("avante-dashboard-body");
      const button = document.getElementById("avante-dashboard-toggle");
      if (!body || !button) {
        return;
      }

      const isCollapsed = body.classList.toggle("collapsed");
      button.textContent = isCollapsed ? "▸" : "▾";
      button.setAttribute("aria-label", isCollapsed ? "Expandir dashboard" : "Recolher dashboard");
    }

    animateRefresh() {
      const panel = document.querySelector(".avante-dashboard-panel");
      if (panel) {
        panel.classList.remove("avante-flash-update");
        void panel.offsetWidth;
        panel.classList.add("avante-flash-update");
      }
    }

    showEmptyState(reason) {
      const container = document.getElementById("avante-dashboard-metrics");
      if (!container) {
        return;
      }

      const message = reason || "Aguardando integração...";

      container.innerHTML = `
        <div class="avante-card avante-error-card">
          <div class="avante-card-label">⚠️ Dados reais indisponíveis</div>
          <div class="avante-card-value">${message}</div>
        </div>
      `;
    }
  }

  function bootstrapDashboardFromPageMessage() {
    if (window.__avanteDashboardInstance || window.__avanteDashboardBootstrapped) {
      return;
    }

    window.__avanteDashboardBootstrapped = true;

    const messageHandler = (event) => {
      if (!event?.data || event.data?.source !== "avante-dashboard-bootstrap") {
        return;
      }

      const { rootId = "avante-web-dashboard-root" } = event.data.payload || {};
      const dashboardInstance = new AvanteDashboardApp({ rootId });
      dashboardInstance.init();
      window.__avanteDashboardInstance = dashboardInstance;
      window.removeEventListener("message", messageHandler);
    };

    window.addEventListener("message", messageHandler, false);
  }

  bootstrapDashboardFromPageMessage();
  window.AvanteDashboardApp = AvanteDashboardApp;
})();
