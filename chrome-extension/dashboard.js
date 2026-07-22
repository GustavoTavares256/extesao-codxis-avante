(() => {
  "use strict";

  /**
   * Dashboard monta toda a interface visual, cards de indicadores, gráficos e controles de interação.
   * A ideia é manter o render separado da camada de dados para facilitar manutenção e evolução.
   */
  class AvanteDashboardApp {
    constructor({ rootId = "avante-web-dashboard-root" } = {}) {
      this.rootId = rootId;
      this.api = window.AvanteDashboardApi;
      this.intervalId = null;
      this.chartInstances = {};
      this.initialized = false;
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
      const host = document.createElement("div");
      host.id = this.rootId;
      host.className = "avante-dashboard-shell";
      host.innerHTML = `
        <div class="avante-dashboard-panel">
          <div class="avante-dashboard-header">
            <div>
              <span class="avante-badge">Avante Web</span>
              <h2>Dashboard Executivo</h2>
            </div>
            <div class="avante-header-actions">
              <button class="avante-toggle-btn" id="avante-dashboard-toggle" aria-label="Recolher dashboard">▾</button>
            </div>
          </div>
          <div class="avante-dashboard-body" id="avante-dashboard-body">
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

      document.body.appendChild(host);

      const toggleButton = document.getElementById("avante-dashboard-toggle");
      toggleButton.addEventListener("click", () => this.toggleDashboard());
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
        this.updateMetrics(data);
        this.renderDebugPanel();
        await this.ensureChartsLoaded();
        this.renderCharts(data);

        if (isRefresh) {
          this.animateRefresh();
        }
      } catch (error) {
        console.error("[Avante Dashboard] Erro ao buscar dados:", error);
        this.showErrorState();
      }
    }

    updateMetrics(data) {
      const metrics = [
        { key: "totalSales", label: "💰 Valor total das vendas", type: "currency" },
        { key: "totalProductsSold", label: "📦 Produtos vendidos", type: "number" },
        { key: "totalProfit", label: "📈 Lucro total", type: "currency" },
        { key: "totalOrders", label: "🛒 Pedidos", type: "number" },
        { key: "salesTarget", label: "🎯 Meta de vendas", type: "progress" },
        { key: "avgTicket", label: "📊 Ticket médio", type: "currency" },
        { key: "bestProduct", label: "🏆 Produto mais vendido", type: "text" }
      ];

      const container = document.getElementById("avante-dashboard-metrics");
      if (!container) {
        return;
      }

      container.innerHTML = metrics
        .map((item) => {
          const rawValue = data[item.key];
          const value = this.formatValue(rawValue, item.type);

          return `
            <div class="avante-card avante-card-animated">
              <div class="avante-card-label">${item.label}</div>
              <div class="avante-card-value">${value}</div>
              ${item.type === "progress" ? this.renderProgressBar(data.salesTarget, data.totalSales) : ""}
            </div>
          `;
        })
        .join("");

      const lastUpdated = document.createElement("div");
      lastUpdated.className = "avante-last-update";
      lastUpdated.innerHTML = `🕒 Última atualização: ${new Date(data.lastUpdated).toLocaleString("pt-BR")}`;
      container.appendChild(lastUpdated);
    }

    renderProgressBar(target, currentValue) {
      const progress = Math.min((currentValue / target) * 100, 100);

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
      switch (type) {
        case "currency":
          return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL"
          }).format(value);
        case "number":
          return new Intl.NumberFormat("pt-BR").format(value);
        case "progress":
          return `${new Intl.NumberFormat("pt-BR").format(value)} / meta`;
        case "text":
          return value;
        default:
          return value;
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

    showErrorState() {
      const container = document.getElementById("avante-dashboard-metrics");
      if (!container) {
        return;
      }

      container.innerHTML = `
        <div class="avante-card avante-error-card">
          <div class="avante-card-label">⚠️ Dados indisponíveis</div>
          <div class="avante-card-value">Não foi possível carregar os indicadores do Avante Web.</div>
        </div>
      `;
    }
  }

  window.AvanteDashboardApp = AvanteDashboardApp;
})();
