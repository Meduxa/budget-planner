// Board view: a one-page, presentation-ready summary for management meetings.
// How the year is going and how the revenue target will be hit.
// Read-only; "Present" goes full screen, "Print / save PDF" uses the browser's print.
BP.views = BP.views || {};
BP.views.board = (function () {
  const U = BP.util;
  const M = BP.model;
  const { fmt, esc } = U;
  const STATUSES = U.S.dealStatuses;

  let focus = null; // focus month index

  function defaultFocus(app, per) {
    const now = new Date();
    if (app.year === now.getFullYear()) return now.getMonth();
    const firstOpen = per.findIndex((x) => x.open && x.forecast > 0);
    return firstOpen >= 0 ? firstOpen : 11;
  }

  function render(el, app) {
    const budget = M.withPaymentActuals(app.data.budget, app.data.payments);
    const rev = M.totals(budget.metrics.revenue);
    const prof = M.totals(budget.metrics.profit);
    const proc = M.totals(budget.metrics.procurement);
    const deals = app.data.forecast.deals;
    const byMonth = M.forecastByMonth(deals);
    const per = M.outlookByMonth(rev, byMonth);
    if (focus == null) focus = defaultFocus(app, per);

    const asOf = new Date().toLocaleDateString(U.S.locale, { day: "numeric", month: "long", year: "numeric" });

    el.innerHTML = `
      <div class="view-head board-head">
        <div><h2>Board summary ${app.year}</h2>
          <p class="sub">${esc(U.S.departmentName)} · as of ${asOf} · ${U.S.currency}, revenue excl. VAT</p></div>
        <div class="actions">
          <button class="btn" data-action="present"><span class="when-normal">Present full screen</span><span class="when-presenting">Exit presentation</span></button>
          <button class="btn" data-action="print">Print / save PDF</button>
        </div>
      </div>
      <div class="kpis">${kpis(rev, prof, proc, per)}</div>

      <div class="card board-card">
        <div class="card-head"><h3>Path to the revenue target</h3></div>
        <div class="legend">${BP.chart.legend(
          [{ label: "Actual", color: "var(--fact)" }, ...STATUSES.map((s) => ({ label: `Forecast: ${s.label}`, color: s.color }))],
          { label: "Target" })}</div>
        <div class="chart" id="boardChart"></div>
        <p class="note">Months with an actual show the actual; open months show the sales forecast by deal status.</p>
      </div>

      <div class="card board-card">
        <div class="card-head"><h3>By quarter</h3></div>
        <div class="table-wrap">${quarterTable(rev, prof, per)}</div>
      </div>

      <div class="card board-card" id="boardFocus">${focusHtml(rev, byMonth, deals)}</div>`;

    BP.chart.render(el.querySelector("#boardChart"), {
      stacked: true,
      series: [
        { label: "Actual", color: "var(--fact)", values: per.map((x) => x.actual) },
        ...STATUSES.map((s) => ({ label: s.label, color: s.color, values: per.map((x, m) => (x.open ? byMonth[m][s.key] : 0)) })),
      ],
      target: { label: "Target", values: rev.plan },
      format: fmt.money,
      extra: (m) => [
        ["Outlook", fmt.money(per[m].outlook)],
        ["vs target", fmt.pct(U.ratio(per[m].outlook, rev.plan[m]))],
      ],
      ariaLabel: "Revenue by month: actual for closed months and forecast for open months, against the target. Quarter values are in the table below.",
    });

    bind(el, app);
  }

  // ── headline tiles ──
  function kpis(rev, prof, proc, per) {
    const year = M.agg(rev, U.ALL);
    const td = M.toDate(rev);
    const outlook = U.sum(per.map((x) => x.outlook));
    const gap = (year.plan || 0) - outlook;
    const ptd = M.toDate(prof);
    const mg = M.margin(rev, prof, U.ALL);
    const pcTd = M.toDate(proc);
    const pcYear = M.agg(proc, U.ALL);

    const tile = (label, value, notes, cls = "") => `<div class="kpi ${cls}">
      <div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>
      ${notes.map((n) => `<div class="kpi-note">${n}</div>`).join("")}</div>`;

    return [
      tile("Revenue target · year", fmt.money(year.plan), [
        td.months.length ? `Actual ${U.monthRange(td.months)}: <b>${fmt.money(td.fact)}</b>` : "No actuals yet",
        td.months.length ? `${fmt.pct(td.pct)} of plan for those months` : "",
      ]),
      tile("Year-end outlook", fmt.money(outlook), [
        `<b>${fmt.pct(U.ratio(outlook, year.plan))}</b> of target`,
        gap > 0 ? `<span class="neg">${fmt.money(gap)} still to find</span>` : `<span class="pos">${fmt.money(-gap)} above target</span>`,
      ], "kpi-hero"),
      tile(ptd.months.length ? `Profit · actual ${U.monthRange(ptd.months)}` : "Profit · plan", fmt.money(ptd.months.length ? ptd.fact : M.agg(prof, U.ALL).plan), [
        ptd.months.length ? `${fmt.pct(ptd.pct)} of plan for those months` : "No actuals yet",
        `Margin actual <b>${fmt.pct(mg.fact)}</b> · plan ${fmt.pct(mg.plan)}`,
      ]),
      tile("Procurement paid", fmt.money(pcTd.fact), [
        pcYear.plan ? `Plan for the year: ${fmt.money(pcYear.plan)}` : "No procurement plan entered",
        pcTd.months.length ? `Paid ${U.monthRange(pcTd.months)}, in ${U.S.currency}` : "",
      ]),
    ].join("");
  }

  // ── quarter table ──
  function quarterTable(rev, prof, per) {
    const rows = [...U.QUARTERS.map((q) => ({ label: q.label, months: q.months, type: "quarter-plain" })),
      { label: "Year", months: U.ALL, type: "annual" }].map((p) => {
      const r = M.agg(rev, p.months);
      const fc = U.sum(p.months.filter((m) => per[m].open).map((m) => per[m].forecast));
      const outlook = U.sum(p.months.map((m) => per[m].outlook));
      const pr = M.agg(prof, p.months);
      const mg = M.margin(rev, prof, p.months);
      const gap = (r.plan || 0) - outlook;
      return `<tr class="row-${p.type}">
        <th scope="row" class="sticky">${p.label}</th>
        <td class="num grp-start">${fmt.num(r.plan)}</td>
        <td class="num">${fmt.num(r.fact)}</td>
        <td class="num">${fc ? fmt.num(fc) : "—"}</td>
        <td class="num strong">${outlook ? fmt.num(outlook) : "—"}</td>
        <td class="num">${outlook ? fmt.pct(U.ratio(outlook, r.plan)) : "—"}</td>
        <td class="num">${r.plan ? (gap > 0 ? `<span class="neg">−${fmt.num(gap)}</span>` : `<span class="pos">+${fmt.num(-gap)}</span>`) : "—"}</td>
        <td class="num grp-start">${fmt.num(pr.plan)}</td>
        <td class="num">${fmt.num(pr.fact)}</td>
        <td class="num grp-start">${fmt.pct(mg.plan)}</td>
        <td class="num">${fmt.pct(mg.fact)}</td>
      </tr>`;
    }).join("");
    return `<table class="data-table">
      <caption>Outlook = actual for closed months + forecast for open months.</caption>
      <thead>
        <tr><th rowspan="2" class="sticky">Period</th>
          <th colspan="6" class="grp grp-start">Revenue</th><th colspan="2" class="grp grp-start">Profit</th>
          <th colspan="2" class="grp grp-start">Margin</th></tr>
        <tr><th class="num grp-start">Target</th><th class="num">Actual</th><th class="num">Forecast</th>
          <th class="num">Outlook</th><th class="num">vs target</th><th class="num">Gap</th>
          <th class="num grp-start">Plan</th><th class="num">Actual</th>
          <th class="num grp-start">Plan</th><th class="num">Actual</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // ── focus month ──
  function focusHtml(rev, byMonth, deals) {
    const m = focus;
    const tgt = rev.plan[m] || 0;
    const stat = byMonth[m];
    const total = U.sum(STATUSES.map((s) => stat[s.key]));
    const actual = rev.fact[m];
    const basis = actual != null ? actual : total;
    const gap = tgt - basis;
    const scale = Math.max(tgt, total, actual || 0) || 1;
    const segs = actual != null
      ? `<span class="bar-seg" style="width:${(actual / scale) * 100}%;background:var(--fact)"></span>`
      : STATUSES.filter((s) => stat[s.key] > 0).map((s) =>
        `<span class="bar-seg" style="width:${(stat[s.key] / scale) * 100}%;background:${s.color}" title="${esc(s.label)}"></span>`).join("");

    const closedKey = STATUSES[0].key;
    const open = deals.filter((d) => d.month === m && d.status !== closedKey && d.gel)
      .sort((a, b) => b.gel - a.gel).slice(0, 8);
    const statusOf = (k) => STATUSES.find((s) => s.key === k) || STATUSES[STATUSES.length - 1];

    return `
      <div class="card-head">
        <h3>Focus: ${U.MONTHS[m]} ${actual != null ? "(closed)" : ""}</h3>
        <div class="month-pills compact" role="group" aria-label="Focus month">${U.MONTHS_SHORT.map((x, i) =>
          `<button type="button" data-focus="${i}" aria-pressed="${i === m}">${x}</button>`).join("")}</div>
      </div>
      <div class="summary-stats">
        <div><span class="lbl">Target</span><b>${fmt.money(tgt)}</b></div>
        ${actual != null
          ? `<div><span class="lbl">Actual</span><b>${fmt.money(actual)}</b></div>`
          : STATUSES.map((s) => `<div><span class="lbl"><span class="dot" style="background:${s.color}"></span>${esc(s.label)}</span><b>${fmt.money(stat[s.key])}</b></div>`).join("")}
        <div><span class="lbl">${gap > 0 ? "Gap to target" : "Above target"}</span><b class="${gap > 0 ? "neg" : "pos"}">${tgt ? fmt.money(Math.abs(gap)) : "—"}</b></div>
      </div>
      <div class="coverage-bar" role="img" aria-label="${actual != null ? "Actual" : "Forecast"} ${fmt.money(basis)} against target ${fmt.money(tgt)}">
        ${segs}${tgt ? `<span class="target-line" style="left:${(tgt / scale) * 100}%"><span>Target</span></span>` : ""}
      </div>
      ${actual == null ? (open.length ? `
        <h4 class="sub-title">Open deals that decide the month</h4>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Deal</th><th>Week</th><th>Status</th><th class="num">${U.S.currency}</th><th class="num">Share of gap</th></tr></thead>
          <tbody>${open.map((d) => `<tr>
            <td>${esc(d.product)}</td><td>${U.ROMAN[d.week]}</td>
            <td><span class="badge"><span class="dot" style="background:${statusOf(d.status).color}"></span>${esc(statusOf(d.status).label)}</span></td>
            <td class="num">${fmt.num(d.gel)}</td>
            <td class="num">${tgt - stat[closedKey] > 0 ? fmt.pct(d.gel / (tgt - stat[closedKey])) : "—"}</td></tr>`).join("")}</tbody>
        </table></div>
        <p class="note">Share of gap = deal value ÷ (target − closed deals).</p>`
        : `<p class="empty">No open deals entered for ${U.MONTHS[m]}.</p>`) : ""}`;
  }

  // ── presenting ──
  function setPresenting(on) {
    document.body.classList.toggle("presenting", on);
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { /* full screen refused: layout still switches */ });
    }
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) document.body.classList.remove("presenting");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("presenting")) setPresenting(false);
  });

  function bind(el, app) {
    el.onclick = (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "present") setPresenting(!document.body.classList.contains("presenting"));
      if (action === "print") window.print();
      const f = e.target.closest("[data-focus]");
      if (f) { focus = Number(f.dataset.focus); render(el, app); }
    };
  }

  return {
    render,
    reset() { setPresenting(false); },
    resetMonth() { focus = null; },
  };
})();
