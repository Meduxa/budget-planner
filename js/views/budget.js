// Budget detail: one metric (Revenue / Profit / Procurement) by budget line,
// Plan vs Actual per month, quarter and year — like the Excel sheets. Editable.
BP.views = BP.views || {};
BP.views.budget = (function () {
  const U = BP.util;
  const M = BP.model;
  const { fmt, esc } = U;

  const st = { metric: "revenue", period: null, editing: false, draft: null, dirty: false, cols: [] };

  const doc = (app) => (st.editing ? st.draft : app.data.budget);
  const currentQuarter = () => `q${Math.floor(new Date().getMonth() / 3)}`;
  const isProc = () => st.metric === "procurement";

  // The metric as displayed: Procurement actuals come from paid supplier payments.
  function metricOf(app) {
    const d = doc(app);
    return isProc() ? M.procurementActuals(d.metrics.procurement, app.data.payments) : d.metrics[st.metric];
  }

  function columns() {
    const cols = [];
    if (st.period === "year") {
      U.QUARTERS.forEach((q) => {
        cols.push({ kind: "plan", months: q.months, group: q.label, first: true });
        cols.push({ kind: "fact", months: q.months, group: q.label });
      });
      cols.push({ kind: "plan", months: U.ALL, group: "Year", agg: true, first: true });
      cols.push({ kind: "fact", months: U.ALL, group: "Year", agg: true });
      cols.push({ kind: "pct", months: U.ALL, group: "Year", agg: true });
      return cols;
    }
    const q = U.QUARTERS[Number(st.period.slice(1))];
    q.months.forEach((m) => {
      cols.push({ kind: "plan", months: [m], group: U.MONTHS[m], edit: m, first: true });
      cols.push({ kind: "fact", months: [m], group: U.MONTHS[m], edit: m });
    });
    cols.push({ kind: "plan", months: q.months, group: `${q.label} total`, agg: true, first: true });
    cols.push({ kind: "fact", months: q.months, group: `${q.label} total`, agg: true });
    cols.push({ kind: "pct", months: q.months, group: `${q.label} total`, agg: true });
    return cols;
  }

  function calc(app, rowKey, col) {
    const d = doc(app);
    const metric = metricOf(app);
    if (rowKey === "__total") {
      const a = M.agg(M.totals(metric), col.months);
      return col.kind === "pct" ? fmt.pct(a.pct) : fmt.num(a[col.kind]);
    }
    if (rowKey === "__margin") {
      if (col.kind === "pct") return "";
      const mg = M.margin(M.totals(d.metrics.revenue), M.totals(d.metrics.profit), col.months);
      return fmt.pct(mg[col.kind]);
    }
    const row = metric.rows.find((r) => r.id === rowKey);
    if (!row) return "";
    const a = M.agg(row, col.months);
    if (col.kind === "pct") return a.fact == null ? "" : fmt.pct(a.pct);
    return a[col.kind] == null ? "" : fmt.num(a[col.kind]);
  }

  const cellCls = (c) => `num${c.agg ? " agg" : ""}${c.first ? " grp-start" : ""}${c.kind === "pct" ? " pct" : ""}`;
  const colName = (c) => (c.kind === "plan" ? "plan" : "actual");

  // Procurement line actuals are calculated from payments, never typed.
  const factFromPayments = (row) => isProc() && row.type === "line";

  function rowHtml(row) {
    const name = st.editing && !row.derived
      ? `<th scope="row" class="sticky"><div class="name-edit">
           <input class="name-input" data-row="${row.id}" data-field="name" value="${esc(row.name)}" aria-label="Line name">
           <button class="icon-btn" data-del="${row.id}" aria-label="Remove line ${esc(row.name)}" title="Remove line">×</button>
         </div></th>`
      : `<th scope="row" class="sticky">${esc(row.name)}</th>`;
    const cells = st.cols.map((c, ci) => {
      if (st.editing && c.edit != null && !row.derived && !(c.kind === "fact" && factFromPayments(row))) {
        return `<td class="${cellCls(c)}"><input type="number" step="any" inputmode="decimal"
          data-row="${row.id}" data-field="${c.kind}" data-m="${c.edit}" value="${row[c.kind][c.edit] ?? ""}"
          aria-label="${esc(row.name)} ${U.MONTHS[c.edit]} ${colName(c)}"></td>`;
      }
      return `<td class="${cellCls(c)}" data-calc="${row.id}|${ci}"></td>`;
    }).join("");
    return `<tr class="row-${row.type}">${name}${cells}</tr>`;
  }

  function totalRowHtml(metric) {
    const cells = st.cols.map((c, ci) => {
      if (st.editing && c.edit != null && c.kind === "fact" && !isProc()) {
        return `<td class="${cellCls(c)}"><input type="number" step="any" inputmode="decimal"
          data-total-fact="${c.edit}" value="${metric.totalFact[c.edit] ?? ""}"
          aria-label="Total ${U.MONTHS[c.edit]} actual"
          title="Type the month's total actual here, or enter actuals per line above"></td>`;
      }
      return `<td class="${cellCls(c)}" data-calc="__total|${ci}"></td>`;
    }).join("");
    return `<tr class="row-total"><th scope="row" class="sticky">Total</th>${cells}</tr>`;
  }

  function render(el, app) {
    if (!st.period) st.period = app.year === new Date().getFullYear() ? currentQuarter() : "year";
    if (st.editing && st.period === "year") st.period = currentQuarter();
    st.cols = columns();

    const metric = metricOf(app);
    const info = M.METRICS.find((x) => x.key === st.metric);
    const lines = metric.rows.filter((r) => r.type === "line");
    const memos = metric.rows.filter((r) => r.type === "memo");
    const span = st.cols.length + 1;

    // header groups
    const groups = [];
    st.cols.forEach((c) => {
      const g = groups[groups.length - 1];
      if (g && g.label === c.group) g.span++;
      else groups.push({ label: c.group, span: 1, agg: c.agg });
    });

    const periodOpts = [...U.QUARTERS.map((q, i) => ({ value: `q${i}`, label: q.label })),
      ...(st.editing ? [] : [{ value: "year", label: "Full year" }])];

    el.innerHTML = `
      <div class="view-head">
        <div><h2>Budget detail ${app.year}</h2>
          <p class="sub">${isProc()
            ? `Actual = paid supplier payments in ${U.S.currency}, by label and month — change them on the
               <a href="#payments">Supplier payments</a> page.${st.editing ? " Keep line names identical to the payment labels." : ""}`
            : st.editing
              ? "Editing: type Plan and Actual per line. If you only know the month's total actual, type it in the Total row."
              : `Plan vs actual by budget line, in ${U.S.currency}.`}</p></div>
        <div class="actions">${U.editActions(st.editing)}</div>
      </div>
      <div class="toolbar">
        ${U.segmented("budMetric", M.METRICS.map((x) => ({ value: x.key, label: x.label })), st.metric, "Metric")}
        ${U.segmented("budPeriod", periodOpts, st.period, "Period")}
      </div>
      <div class="card">
        <div class="table-wrap">
          <table class="data-table budget-table${st.editing ? " editing" : ""}">
            <caption>${esc(info.label)}${info.hint ? ` (${info.hint})` : ""} — ${esc(U.S.departmentName)}, ${app.year}</caption>
            <thead>
              <tr><th rowspan="2" class="sticky">Line</th>${groups.map((g) =>
                `<th colspan="${g.span}" class="grp grp-start${g.agg ? " agg" : ""}">${esc(g.label)}</th>`).join("")}</tr>
              <tr>${st.cols.map((c) =>
                `<th class="${cellCls(c)}">${c.kind === "plan" ? "Plan" : c.kind === "fact" ? "Actual" : "%"}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${lines.map(rowHtml).join("")}
              ${totalRowHtml(metric)}
              ${st.metric === "profit" ? `<tr class="row-margin"><th scope="row" class="sticky">Profit margin</th>${st.cols.map((c, ci) =>
                `<td class="${cellCls(c)}" data-calc="__margin|${ci}"></td>`).join("")}</tr>` : ""}
              ${memos.length ? `<tr class="row-section"><th colspan="${span}" class="sticky-cell">Of which (not added to total)</th></tr>
                ${memos.map(rowHtml).join("")}` : ""}
            </tbody>
          </table>
        </div>
        ${st.editing ? `<div class="table-actions">
          <button class="btn small" data-add="line">+ Add budget line</button>
          <button class="btn small" data-add="memo">+ Add “of which” line</button>
        </div>` : ""}
      </div>`;

    updateComputed(el, app);
    bind(el, app);
  }

  function updateComputed(el, app) {
    el.querySelectorAll("[data-calc]").forEach((td) => {
      const [rowKey, ci] = td.dataset.calc.split("|");
      td.textContent = calc(app, rowKey, st.cols[ci]);
    });
    if (!st.editing) return;
    const metric = st.draft.metrics[st.metric];
    el.querySelectorAll("[data-total-fact]").forEach((input) => {
      const m = Number(input.dataset.totalFact);
      const fromLines = M.lineFactsIn(metric, m);
      input.disabled = fromLines;
      if (fromLines) input.value = Math.round(M.totals(metric).fact[m] * 100) / 100;
      else if (document.activeElement !== input) input.value = metric.totalFact[m] ?? "";
    });
  }

  function bind(el, app) {
    el.onclick = async (e) => {
      const seg = e.target.closest("[data-seg] button");
      if (seg) {
        const which = seg.closest("[data-seg]").dataset.seg;
        if (which === "budMetric") st.metric = seg.dataset.value;
        if (which === "budPeriod") st.period = seg.dataset.value;
        render(el, app);
        return;
      }
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "edit") {
        st.editing = true;
        st.dirty = false;
        st.draft = U.clone(app.data.budget);
        render(el, app);
      } else if (action === "cancel") {
        if (st.dirty && !confirm("Discard unsaved changes?")) return;
        reset();
        render(el, app);
      } else if (action === "save") {
        if (await app.save("budget", st.draft)) { reset(); render(el, app); }
      }
      const del = e.target.closest("[data-del]");
      if (del) {
        const metric = st.draft.metrics[st.metric];
        const row = metric.rows.find((r) => r.id === del.dataset.del);
        const hasData = row && [...row.plan, ...row.fact].some((v) => v != null);
        if (hasData && !confirm(`Remove “${row.name}” and all its figures for ${app.year}?`)) return;
        metric.rows = metric.rows.filter((r) => r.id !== del.dataset.del);
        st.dirty = true;
        render(el, app);
      }
      const add = e.target.closest("[data-add]");
      if (add) {
        const metric = st.draft.metrics[st.metric];
        const row = M.newRow("", add.dataset.add);
        if (add.dataset.add === "line") {
          const lastLine = metric.rows.map((r) => r.type).lastIndexOf("line");
          metric.rows.splice(lastLine + 1, 0, row);
        } else metric.rows.push(row);
        st.dirty = true;
        render(el, app);
        el.querySelector(`input[data-row="${row.id}"][data-field=name]`)?.focus();
      }
    };

    el.oninput = (e) => {
      const t = e.target;
      const metric = st.draft?.metrics[st.metric];
      if (!metric) return;
      if (t.dataset.totalFact != null) {
        metric.totalFact[Number(t.dataset.totalFact)] = U.toNum(t.value);
      } else if (t.dataset.row) {
        const row = metric.rows.find((r) => r.id === t.dataset.row);
        if (!row) return;
        if (t.dataset.field === "name") row.name = t.value;
        else row[t.dataset.field][Number(t.dataset.m)] = U.toNum(t.value);
      } else return;
      st.dirty = true;
      updateComputed(el, app);
    };
  }

  function reset() {
    st.editing = false;
    st.draft = null;
    st.dirty = false;
  }

  return { render, reset, isDirty: () => st.dirty };
})();
