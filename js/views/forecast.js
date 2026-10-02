// Sales forecast: how each month's revenue target will be hit.
// Top: target coverage for the whole year (chart + table).
// Bottom: one month's deals by week (I–V), editable.
BP.views = BP.views || {};
BP.views.forecast = (function () {
  const U = BP.util;
  const M = BP.model;
  const { fmt, esc } = U;
  const STATUSES = U.S.dealStatuses;
  const statusOf = (k) => STATUSES.find((s) => s.key === k) || STATUSES[STATUSES.length - 1];

  const st = { month: null, editing: false, draft: null, dirty: false };
  const deals = (app) => (st.editing ? st.draft : app.data.forecast).deals;

  function defaultMonth(app) {
    const now = new Date();
    if (app.year === now.getFullYear()) return now.getMonth();
    const first = app.data.forecast.deals.map((d) => d.month).sort((a, b) => a - b)[0];
    return first ?? 0;
  }

  function monthStats(app) {
    const target = M.totals(app.data.budget.metrics.revenue);
    const byMonth = M.forecastByMonth(deals(app));
    return { target, byMonth };
  }

  function render(el, app) {
    if (st.month == null) st.month = defaultMonth(app);

    el.innerHTML = `
      <div class="view-head">
        <div><h2>Sales forecast ${app.year}</h2>
          <p class="sub">Expected sales by month and week, compared with the revenue plan (${U.S.currency}).</p></div>
        <div class="actions">${U.editActions(st.editing)}</div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Target coverage</h3></div>
        <div class="legend">${BP.chart.legend(STATUSES.map((s) => ({ label: s.label, color: s.color })), { label: "Revenue target" })}</div>
        <div class="chart" id="fcChart"></div>
        <div class="table-wrap" id="fcTable"></div>
      </div>

      <div class="card" id="fcMonthCard">
        <div class="month-pills" role="group" aria-label="Month">${U.MONTHS_SHORT.map((m, i) =>
          `<button type="button" data-month="${i}" aria-pressed="${i === st.month}">${m}</button>`).join("")}</div>
        <h3 class="month-title">${U.MONTHS[st.month]} ${app.year}</h3>
        <div id="fcSummary"></div>
        <div id="fcWeeks">${weeksHtml(app)}</div>
      </div>`;

    updateComputed(el, app);
    bind(el, app);
  }

  // ── computed parts (redrawn on every edit) ──
  function updateComputed(el, app) {
    const { target, byMonth } = monthStats(app);
    const totalOf = (i) => U.sum(STATUSES.map((s) => byMonth[i][s.key]));

    BP.chart.render(el.querySelector("#fcChart"), {
      stacked: true,
      series: STATUSES.map((s) => ({ label: s.label, color: s.color, values: byMonth.map((b) => b[s.key]) })),
      target: { label: "Revenue target", values: target.plan },
      format: fmt.money,
      extra: (i) => [
        ["Forecast total", fmt.money(totalOf(i))],
        ["Forecast vs target", fmt.pct(U.ratio(totalOf(i), target.plan[i]))],
        ...(target.fact[i] != null ? [["Actual", fmt.money(target.fact[i])]] : []),
      ],
      ariaLabel: "Forecast by status for each month compared with the revenue target. Exact values are in the table below.",
    });

    el.querySelector("#fcTable").innerHTML = coverageTable(byMonth, target);
    el.querySelector("#fcSummary").innerHTML = summaryHtml(byMonth[st.month], target, st.month);

    el.querySelectorAll("[data-calc]").forEach((node) => {
      const [scope, field] = node.dataset.calc.split("|");
      const list = deals(app).filter((d) => d.month === st.month && (scope === "month" || d.week === Number(scope)));
      const v = U.sumOrNull(list.map((d) => d[field]));
      node.textContent = field === "usd" ? (v == null ? "" : fmt.ccy(v, "USD")) : (v == null ? "" : fmt.num(v));
    });
  }

  // Outlook = actual for months that are closed (have an actual), forecast for the rest.
  function outlookOf(byMonth, target, months) {
    return U.sum(months.map((m) => (target.fact[m] != null
      ? target.fact[m]
      : U.sum(STATUSES.map((x) => byMonth[m][x.key])))));
  }

  function coverageTable(byMonth, target) {
    const rows = U.periodRows().map((p) => {
      const t = M.agg(target, p.months);
      const s = Object.fromEntries(STATUSES.map((x) => [x.key, U.sum(p.months.map((m) => byMonth[m][x.key]))]));
      const total = U.sum(STATUSES.map((x) => s[x.key]));
      const outlook = outlookOf(byMonth, target, p.months);
      const cov = U.ratio(outlook, t.plan);
      const attrs = p.type === "month" ? ` class="row-month clickable${p.month === st.month ? " selected" : ""}" data-month="${p.month}" tabindex="0"` : ` class="row-${p.type}"`;
      return `<tr${attrs}>
        <th scope="row" class="sticky">${esc(p.label)}</th>
        <td class="num grp-start">${fmt.num(t.plan)}</td>
        <td class="num">${fmt.num(t.fact)}</td>
        ${STATUSES.map((x, i) => `<td class="num${i === 0 ? " grp-start" : ""}">${s[x.key] ? fmt.num(s[x.key]) : ""}</td>`).join("")}
        <td class="num grp-start">${total ? fmt.num(total) : ""}</td>
        <td class="num grp-start strong">${outlook ? fmt.num(outlook) : ""}</td>
        <td class="num">${cov == null || !outlook ? "" : fmt.pct(cov)}</td>
        <td class="num">${t.plan && outlook ? gapText(t.plan - outlook) : ""}</td>
      </tr>`;
    }).join("");
    return `<table class="data-table">
      <caption>Click a month to see its deals. Outlook = actual for months already closed + forecast for open months.</caption>
      <thead><tr>
        <th class="sticky">Period</th><th class="num grp-start">Target</th><th class="num">Actual</th>
        ${STATUSES.map((s, i) => `<th class="num${i === 0 ? " grp-start" : ""}"><span class="dot" style="background:${s.color}"></span>${esc(s.label)}</th>`).join("")}
        <th class="num grp-start">Forecast</th><th class="num grp-start">Outlook</th><th class="num">vs target</th><th class="num">Gap</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function gapText(gap) {
    return gap > 0 ? `<span class="neg">−${fmt.num(gap)}</span>` : `<span class="pos">+${fmt.num(-gap)}</span>`;
  }

  function summaryHtml(stat, target, m) {
    const tgt = target.plan[m] || 0;
    const total = U.sum(STATUSES.map((s) => stat[s.key]));
    const scale = Math.max(tgt, total) || 1;
    const segs = STATUSES.filter((s) => stat[s.key] > 0).map((s) =>
      `<span class="bar-seg" style="width:${(stat[s.key] / scale) * 100}%;background:${s.color}" title="${esc(s.label)}: ${fmt.money(stat[s.key])}"></span>`).join("");
    const gap = tgt - total;
    return `
      <div class="summary-stats">
        <div><span class="lbl">Target</span><b>${fmt.money(target.plan[m])}</b></div>
        <div><span class="lbl">Actual</span><b>${fmt.money(target.fact[m])}</b></div>
        <div><span class="lbl">Forecast</span><b>${fmt.money(total)}</b></div>
        <div><span class="lbl">Forecast vs target</span><b>${fmt.pct(U.ratio(total, tgt))}</b></div>
        <div><span class="lbl">${gap > 0 ? "Still to find" : "Above target"}</span><b class="${gap > 0 ? "neg" : "pos"}">${tgt ? fmt.money(Math.abs(gap)) : "—"}</b></div>
      </div>
      <div class="coverage-bar" role="img" aria-label="Forecast ${fmt.money(total)} against target ${fmt.money(tgt)}">
        ${segs}
        ${tgt ? `<span class="target-line" style="left:${(tgt / scale) * 100}%"><span>Target</span></span>` : ""}
      </div>
      <div class="status-breakdown">${STATUSES.map((s) =>
        `<span><span class="dot" style="background:${s.color}"></span>${esc(s.label)} <b>${fmt.money(stat[s.key])}</b></span>`).join("")}</div>`;
  }

  // ── weekly deal tables ──
  function weeksHtml(app) {
    const list = deals(app).filter((d) => d.month === st.month);
    if (!list.length && !st.editing) {
      return `<p class="empty">No deals entered for ${U.MONTHS[st.month]} yet. Click <b>Edit</b> to add them.</p>`;
    }
    const weeks = [1, 2, 3, 4, 5].filter((w) => st.editing || list.some((d) => d.week === w));
    const head = `<thead><tr><th>Product / deal</th><th>Status</th><th class="num">USD</th>
      <th class="num">${U.S.currency}</th><th class="num">Profit</th>${st.editing ? "<th></th>" : ""}</tr></thead>`;
    const blocks = weeks.map((w) => {
      const rows = list.filter((d) => d.week === w).map(dealRow).join("");
      return `<tbody class="week">
        <tr class="row-section"><th colspan="${st.editing ? 6 : 5}">Week ${U.ROMAN[w]}</th></tr>
        ${rows}
        ${st.editing ? `<tr class="row-add"><td colspan="6"><button class="btn small" data-add-week="${w}">+ Add deal to week ${U.ROMAN[w]}</button></td></tr>` : ""}
        <tr class="row-quarter"><th scope="row">Week ${U.ROMAN[w]} total</th><td></td>
          <td class="num" data-calc="${w}|usd"></td><td class="num" data-calc="${w}|gel"></td><td class="num" data-calc="${w}|profit"></td>${st.editing ? "<td></td>" : ""}</tr>
      </tbody>`;
    }).join("");
    return `<div class="table-wrap"><table class="data-table deals-table${st.editing ? " editing" : ""}">
      ${head}${blocks}
      <tbody><tr class="row-annual"><th scope="row">${U.MONTHS[st.month]} total</th><td></td>
        <td class="num" data-calc="month|usd"></td><td class="num" data-calc="month|gel"></td><td class="num" data-calc="month|profit"></td>${st.editing ? "<td></td>" : ""}</tr></tbody>
    </table></div>`;
  }

  function dealRow(d) {
    const s = statusOf(d.status);
    if (!st.editing) {
      return `<tr>
        <td>${esc(d.product)}</td>
        <td><span class="badge"><span class="dot" style="background:${s.color}"></span>${esc(s.label)}</span></td>
        <td class="num">${d.usd == null ? "" : fmt.ccy(d.usd, "USD")}</td>
        <td class="num">${fmt.num(d.gel)}</td>
        <td class="num">${d.profit == null ? "" : fmt.num(d.profit)}</td>
      </tr>`;
    }
    const numIn = (f, label) => `<input type="number" step="any" inputmode="decimal" data-deal="${d.id}" data-field="${f}" value="${d[f] ?? ""}" aria-label="${label}">`;
    return `<tr>
      <td><input class="text-input" data-deal="${d.id}" data-field="product" value="${esc(d.product)}" aria-label="Product"></td>
      <td><select data-deal="${d.id}" data-field="status" aria-label="Status">${STATUSES.map((x) =>
        `<option value="${x.key}"${x.key === d.status ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select></td>
      <td class="num">${numIn("usd", "USD amount")}</td>
      <td class="num">${numIn("gel", `${U.S.currency} amount`)}</td>
      <td class="num">${numIn("profit", "Profit")}</td>
      <td><button class="icon-btn" data-del="${d.id}" aria-label="Remove deal" title="Remove deal">×</button></td>
    </tr>`;
  }

  function bind(el, app) {
    const selectMonth = (m) => {
      st.month = m;
      render(el, app);
      el.querySelector("#fcMonthCard").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    el.onclick = async (e) => {
      const monthBtn = e.target.closest("[data-month]");
      if (monthBtn) {
        const m = Number(monthBtn.dataset.month);
        if (monthBtn.tagName === "TR") selectMonth(m);
        else { st.month = m; render(el, app); }
        return;
      }
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "edit") {
        st.editing = true; st.dirty = false; st.draft = U.clone(app.data.forecast); render(el, app);
      } else if (action === "cancel") {
        if (st.dirty && !confirm("Discard unsaved changes?")) return;
        reset(); render(el, app);
      } else if (action === "save") {
        const clean = { deals: st.draft.deals.filter((d) => d.product.trim() || d.gel != null || d.usd != null) };
        if (await app.save("forecast", clean)) { reset(); render(el, app); }
      }
      const add = e.target.closest("[data-add-week]");
      if (add) {
        const deal = M.newDeal(st.month, Number(add.dataset.addWeek));
        st.draft.deals.push(deal);
        st.dirty = true;
        render(el, app);
        el.querySelector(`[data-deal="${deal.id}"][data-field=product]`)?.focus();
      }
      const del = e.target.closest("[data-del]");
      if (del) {
        st.draft.deals = st.draft.deals.filter((d) => d.id !== del.dataset.del);
        st.dirty = true;
        render(el, app);
      }
    };
    el.onkeydown = (e) => {
      const row = e.target.closest?.("tr[data-month]");
      if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectMonth(Number(row.dataset.month)); }
    };
    const onEdit = (e) => {
      const t = e.target;
      if (!t.dataset.deal || !st.draft) return;
      const deal = st.draft.deals.find((d) => d.id === t.dataset.deal);
      if (!deal) return;
      const f = t.dataset.field;
      deal[f] = f === "product" || f === "status" ? t.value : U.toNum(t.value);
      st.dirty = true;
      updateComputed(el, app);
    };
    el.oninput = onEdit;
    el.onchange = onEdit;
  }

  function reset() {
    st.editing = false;
    st.draft = null;
    st.dirty = false;
  }

  return { render, reset, isDirty: () => st.dirty, resetMonth: () => { st.month = null; } };
})();
