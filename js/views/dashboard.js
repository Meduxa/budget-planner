// Dashboard: annual KPIs, plan-vs-actual chart, and the month / quarter / annual summary table.
BP.views = BP.views || {};
BP.views.dashboard = (function () {
  const U = BP.util;
  const M = BP.model;
  const { fmt, esc } = U;
  let chartMetric = "revenue";

  function allTotals(budget) {
    return Object.fromEntries(M.METRICS.map(({ key }) => [key, M.totals(budget.metrics[key])]));
  }

  function kpiTile(label, value, lines) {
    return `<div class="kpi">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      ${lines.map((l) => `<div class="kpi-note">${l}</div>`).join("")}
    </div>`;
  }

  function moneyTile(label, series) {
    const year = M.agg(series, U.ALL);
    const td = M.toDate(series);
    const lines = td.months.length
      ? [`Actual ${U.monthRange(td.months)}: <b>${fmt.money(td.fact)}</b>`,
        `${fmt.pct(td.pct)} of plan for those months`]
      : ["No actuals entered yet"];
    return kpiTile(`${label} · annual plan`, fmt.money(year.plan), lines);
  }

  function render(el, app) {
    const T = allTotals(app.data.budget);
    const mg = M.margin(T.revenue, T.profit, U.ALL);
    const mgMonths = U.ALL.filter((m) => T.revenue.fact[m] != null && T.profit.fact[m] != null);

    const kpis = [
      moneyTile("Revenue", T.revenue),
      moneyTile("Profit", T.profit),
      kpiTile("Profit margin · plan", fmt.pct(mg.plan),
        mgMonths.length
          ? [`Actual ${U.monthRange(mgMonths)}: <b>${fmt.pct(mg.fact)}</b>`, "Profit ÷ revenue"]
          : ["Profit ÷ revenue", "No actuals entered yet"]),
      moneyTile("Procurement", T.procurement),
    ].join("");

    const metricOpts = M.METRICS.map((x) => ({ value: x.key, label: x.label }));

    el.innerHTML = `
      <div class="view-head">
        <div><h2>Dashboard ${app.year}</h2><p class="sub">All figures in ${U.S.currency}. Revenue excludes VAT.</p></div>
      </div>
      <div class="kpis">${kpis}</div>

      <div class="card">
        <div class="card-head">
          <h3>Plan vs actual by month</h3>
          ${U.segmented("dashMetric", metricOpts, chartMetric, "Chart metric")}
        </div>
        <div class="legend" id="dashLegend"></div>
        <div class="chart" id="dashChart"></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Budget summary — months, quarters, year</h3></div>
        <div class="table-wrap">${summaryTable(T)}</div>
      </div>`;

    drawChart(el, T);

    el.onclick = (e) => {
      const b = e.target.closest("[data-seg=dashMetric] button");
      if (!b) return;
      chartMetric = b.dataset.value;
      el.querySelectorAll("[data-seg=dashMetric] button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      drawChart(el, T);
    };
  }

  function drawChart(el, T) {
    const s = T[chartMetric];
    const label = M.METRICS.find((x) => x.key === chartMetric).label;
    const series = [
      { label: `${label} plan`, color: "var(--plan)", values: s.plan },
      { label: `${label} actual`, color: "var(--fact)", values: s.fact },
    ];
    el.querySelector("#dashLegend").innerHTML = BP.chart.legend(series);
    BP.chart.render(el.querySelector("#dashChart"), {
      series,
      format: fmt.money,
      extra: (i) => (s.fact[i] != null ? [["% of plan", fmt.pct(U.ratio(s.fact[i], s.plan[i]))]] : []),
      ariaLabel: `${label} plan and actual by month. Exact values are in the summary table.`,
    });
  }

  function summaryTable(T) {
    const pctCell = (a) => `<td class="num pct">${fmt.pct(a.pct)}</td>`;
    const moneyCells = (a) => `<td class="num grp-start">${fmt.num(a.plan)}</td><td class="num">${fmt.num(a.fact)}</td>${pctCell(a)}`;
    const body = U.periodRows().map((p) => {
      const r = M.agg(T.revenue, p.months);
      const pr = M.agg(T.profit, p.months);
      const pc = M.agg(T.procurement, p.months);
      const mg = M.margin(T.revenue, T.profit, p.months);
      return `<tr class="row-${p.type}">
        <th scope="row" class="sticky">${esc(p.label)}</th>
        ${moneyCells(r)}${moneyCells(pr)}
        <td class="num grp-start">${fmt.pct(mg.plan)}</td><td class="num">${fmt.pct(mg.fact)}</td>
        ${moneyCells(pc)}
      </tr>`;
    }).join("");

    const sub3 = `<th class="num grp-start">Plan</th><th class="num">Actual</th><th class="num">%</th>`;
    return `<table class="data-table">
      <caption>Actual as % of plan. Quarter and annual margins are total profit ÷ total revenue.</caption>
      <thead>
        <tr><th rowspan="2" class="sticky">Period</th>
          <th colspan="3" class="grp grp-start">Revenue</th><th colspan="3" class="grp grp-start">Profit</th>
          <th colspan="2" class="grp grp-start">Profit margin</th><th colspan="3" class="grp grp-start">Procurement</th></tr>
        <tr>${sub3}${sub3}<th class="num grp-start">Plan</th><th class="num">Actual</th>${sub3}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  return { render };
})();
