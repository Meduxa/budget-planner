// Sales forecast: how each month's revenue target will be hit.
// Top: target coverage for the whole year (chart + table).
// Bottom: one month's deals by week (I–V), editable.
// Frozen versions ("Week I", "Week II", …) keep the forecast exactly as reported
// at a meeting; they are read-only and can be compared with today's forecast.
BP.views = BP.views || {};
BP.views.forecast = (function () {
  const U = BP.util;
  const M = BP.model;
  const { fmt, esc } = U;
  const STATUSES = U.S.dealStatuses;
  const statusOf = (k) => STATUSES.find((s) => s.key === k) || STATUSES[STATUSES.length - 1];

  // view = id of the frozen version being shown (null = live forecast)
  const st = { month: null, editing: false, draft: null, dirty: false, view: null, freezing: false };
  const snapshots = (app) => app.data.forecast.snapshots || [];
  const snapOf = (app) => (st.view ? snapshots(app).find((s) => s.id === st.view) || null : null);
  const deals = (app) => snapOf(app)?.deals ?? (st.editing ? st.draft : app.data.forecast).deals;

  function savedWhen(s) {
    const d = new Date(s.savedAt);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(U.S.locale,
      { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  const defaultSnapName = () => `Week ${U.ROMAN[Math.min(5, Math.ceil(new Date().getDate() / 7))]}`;

  function defaultMonth(app) {
    const now = new Date();
    if (app.year === now.getFullYear()) return now.getMonth();
    const first = app.data.forecast.deals.map((d) => d.month).sort((a, b) => a - b)[0];
    return first ?? 0;
  }

  function monthStats(app) {
    const target = snapOf(app)?.target ?? M.totals(app.data.budget.metrics.revenue);
    const byMonth = M.forecastByMonth(deals(app));
    return { target, byMonth };
  }

  function render(el, app) {
    if (st.month == null) st.month = defaultMonth(app);
    if (st.view && !snapOf(app)) st.view = null; // version was deleted
    const snap = snapOf(app);

    el.innerHTML = `
      <div class="view-head">
        <div><h2>Sales forecast ${app.year}</h2>
          <p class="sub">Expected sales by month and week, compared with the revenue plan (${U.S.currency}).</p></div>
        <div class="actions">${snap
          ? `<button class="btn" data-action="live">Back to live forecast</button>`
          : U.editActions(st.editing)}</div>
      </div>
      ${snapBar(app, snap)}

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
      </div>
      ${snap ? `<div class="card" id="fcCompare"></div>` : ""}`;

    updateComputed(el, app);
    bind(el, app);
    if (st.freezing) el.querySelector("[data-freeze-form] input")?.select();
  }

  // ── frozen versions ──
  function snapBar(app, snap) {
    const list = [...snapshots(app)].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    return `
      <div class="snap-bar">
        <label class="snap-select">Showing
          <select data-snap-select aria-label="Forecast version"${st.editing ? " disabled" : ""}>
            <option value="">Live forecast (today)</option>
            ${list.map((s) => `<option value="${s.id}"${s.id === st.view ? " selected" : ""}>❄ ${esc(s.name)} — ${savedWhen(s)}</option>`).join("")}
          </select>
        </label>
        ${!snap && !st.editing && !st.freezing ? `<button class="btn" data-action="freeze">❄ Freeze this forecast…</button>` : ""}
        ${snap ? `<button class="btn ghost danger" data-action="delete-snap">Delete this version</button>` : ""}
        ${list.length || st.freezing ? "" : `<span class="note">No frozen versions yet — freeze the forecast after each board meeting.</span>`}
      </div>
      ${st.freezing ? `
        <form class="freeze-form" data-freeze-form>
          <label>Name <input name="snapName" value="${esc(defaultSnapName())}" maxlength="60" required aria-label="Name of the frozen version"></label>
          <button class="btn primary" type="submit">Save frozen version</button>
          <button class="btn" type="button" data-action="freeze-cancel">Cancel</button>
          <p class="note">Saves every month's deals, targets and actuals exactly as they are now. Later changes won't affect it.</p>
        </form>` : ""}
      ${snap ? `<div class="frozen-banner" role="status">❄ <span><b>Frozen version “${esc(snap.name)}”</b>, saved ${savedWhen(snap)}${snap.savedBy ? ` by ${esc(snap.savedBy)}` : ""}.
        Read-only — the figures are exactly as they were then. See what changed since then at the bottom of the page.</span></div>` : ""}`;
  }

  async function saveSnapshot(el, app, name) {
    const existing = snapshots(app).find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing && !confirm(`A version named “${existing.name}” already exists (saved ${savedWhen(existing)}). Save another one with the same name?`)) return;
    const snap = M.makeSnapshot(name, app.data.forecast.deals, M.totals(app.data.budget.metrics.revenue), app.user?.email);
    const doc = { deals: app.data.forecast.deals, snapshots: [...snapshots(app), snap] };
    if (await app.save("forecast", doc)) {
      st.freezing = false;
      render(el, app);
      app.status(`Frozen version “${name}” saved.`);
    }
  }

  async function deleteSnapshot(el, app) {
    const snap = snapOf(app);
    if (!snap || !confirm(`Delete the frozen version “${snap.name}” (saved ${savedWhen(snap)})? This can't be undone.`)) return;
    const doc = { deals: app.data.forecast.deals, snapshots: snapshots(app).filter((s) => s.id !== snap.id) };
    if (await app.save("forecast", doc)) { st.view = null; render(el, app); }
  }

  // Frozen version vs today's live forecast.
  function compareHtml(app, snap) {
    const nowT = M.totals(app.data.budget.metrics.revenue);
    const nowDeals = app.data.forecast.deals;
    const thenPer = M.outlookByMonth(snap.target, M.forecastByMonth(snap.deals));
    const nowPer = M.outlookByMonth(nowT, M.forecastByMonth(nowDeals));
    const delta = (a, b) => {
      const d = (b || 0) - (a || 0);
      return Math.abs(d) < 0.5 ? `<span class="muted">—</span>` : d > 0 ? `<span class="pos">+${fmt.num(d)}</span>` : `<span class="neg">−${fmt.num(-d)}</span>`;
    };
    const months = U.ALL.filter((m) => thenPer[m].forecast || nowPer[m].forecast);
    const row = (label, ms, cls) => {
      const s = (per, k) => U.sum(ms.map((m) => per[m][k]));
      return `<tr class="${cls}"><th scope="row" class="sticky">${label}</th>
        <td class="num grp-start">${fmt.num(s(thenPer, "forecast"))}</td><td class="num">${fmt.num(s(nowPer, "forecast"))}</td>
        <td class="num">${delta(s(thenPer, "forecast"), s(nowPer, "forecast"))}</td>
        <td class="num grp-start">${fmt.num(s(thenPer, "outlook"))}</td><td class="num">${fmt.num(s(nowPer, "outlook"))}</td>
        <td class="num">${delta(s(thenPer, "outlook"), s(nowPer, "outlook"))}</td></tr>`;
    };

    // deal-level changes in the selected month
    const m = st.month;
    const thenMap = new Map(snap.deals.map((d) => [d.id, d]));
    const nowMap = new Map(nowDeals.map((d) => [d.id, d]));
    const changes = [];
    nowDeals.filter((d) => d.month === m).forEach((d) => {
      const t = thenMap.get(d.id);
      if (!t) changes.push({ name: d.product, what: "New deal", then: null, now: d.gel });
      else if (t.month !== m) changes.push({ name: d.product, what: `Moved in from ${U.MONTHS_SHORT[t.month]}`, then: null, now: d.gel });
      else {
        const what = [];
        if ((t.gel || 0) !== (d.gel || 0)) what.push("Value changed");
        if (t.status !== d.status) what.push(`${statusOf(t.status).label} → ${statusOf(d.status).label}`);
        if (t.week !== d.week) what.push(`Week ${U.ROMAN[t.week]} → ${U.ROMAN[d.week]}`);
        if (t.product !== d.product) what.push(`Renamed from “${t.product}”`);
        if (what.length) changes.push({ name: d.product, what: what.join(" · "), then: t.gel, now: d.gel });
      }
    });
    snap.deals.filter((t) => t.month === m).forEach((t) => {
      const d = nowMap.get(t.id);
      if (!d) changes.push({ name: t.product, what: "Removed", then: t.gel, now: null });
      else if (d.month !== m) changes.push({ name: t.product, what: `Moved to ${U.MONTHS_SHORT[d.month]}`, then: t.gel, now: null });
    });

    return `
      <div class="card-head"><h3>What changed since “${esc(snap.name)}”</h3></div>
      <p class="note">Frozen version (then) vs the live forecast today (now), in ${U.S.currency}.</p>
      <div class="table-wrap"><table class="data-table">
        <thead>
          <tr><th rowspan="2" class="sticky">Month</th><th colspan="3" class="grp grp-start">Forecast</th><th colspan="3" class="grp grp-start">Outlook</th></tr>
          <tr><th class="num grp-start">Then</th><th class="num">Now</th><th class="num">Change</th>
            <th class="num grp-start">Then</th><th class="num">Now</th><th class="num">Change</th></tr>
        </thead>
        <tbody>${months.map((x) => row(U.MONTHS[x], [x], x === m ? "selected" : "")).join("")}
          ${row("Year", U.ALL, "row-annual")}</tbody>
      </table></div>
      <h4 class="sub-title">Deal changes in ${U.MONTHS[m]}</h4>
      ${changes.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Deal</th><th>What changed</th><th class="num">Then</th><th class="num">Now</th><th class="num">Difference</th></tr></thead>
        <tbody>${changes.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.what)}</td>
          <td class="num">${c.then == null ? "—" : fmt.num(c.then)}</td><td class="num">${c.now == null ? "—" : fmt.num(c.now)}</td>
          <td class="num">${delta(c.then, c.now)}</td></tr>`).join("")}</tbody>
      </table></div>` : `<p class="empty">No deal changes in ${U.MONTHS[m]} since this version.</p>`}`;
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
    const snap = snapOf(app);
    if (snap) el.querySelector("#fcCompare").innerHTML = compareHtml(app, snap);

    el.querySelectorAll("[data-calc]").forEach((node) => {
      const [scope, field] = node.dataset.calc.split("|");
      const list = deals(app).filter((d) => d.month === st.month && (scope === "month" || d.week === Number(scope)));
      const v = U.sumOrNull(list.map((d) => d[field]));
      node.textContent = field === "usd" ? (v == null ? "" : fmt.ccy(v, "USD")) : (v == null ? "" : fmt.num(v));
    });
  }

  // Outlook = actual for months that are closed (have an actual), forecast for the rest.
  function outlookOf(byMonth, target, months) {
    const per = M.outlookByMonth(target, byMonth);
    return U.sum(months.map((m) => per[m].outlook));
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
      return snapOf(app)
        ? `<p class="empty">This frozen version has no deals for ${U.MONTHS[st.month]}.</p>`
        : `<p class="empty">No deals entered for ${U.MONTHS[st.month]} yet. Click <b>Edit</b> to add them.</p>`;
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
        st.editing = true; st.dirty = false; st.freezing = false; st.draft = U.clone(app.data.forecast); render(el, app);
      } else if (action === "cancel") {
        if (st.dirty && !confirm("Discard unsaved changes?")) return;
        reset(); render(el, app);
      } else if (action === "save") {
        // keep the frozen versions; only the live deals change
        const clean = {
          deals: st.draft.deals.filter((d) => d.product.trim() || d.gel != null || d.usd != null),
          snapshots: snapshots(app),
        };
        if (await app.save("forecast", clean)) { reset(); render(el, app); }
      } else if (action === "freeze") {
        st.freezing = true; render(el, app);
      } else if (action === "freeze-cancel") {
        st.freezing = false; render(el, app);
      } else if (action === "live") {
        st.view = null; render(el, app);
      } else if (action === "delete-snap") {
        deleteSnapshot(el, app);
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
    el.onsubmit = (e) => {
      if (!e.target.matches("[data-freeze-form]")) return;
      e.preventDefault();
      const name = e.target.elements.snapName.value.trim();
      if (name) saveSnapshot(el, app, name);
    };
    const onEdit = (e) => {
      const t = e.target;
      if (t.matches("[data-snap-select]")) {
        if (e.type !== "change") return;
        st.view = t.value || null;
        st.freezing = false;
        render(el, app);
        return;
      }
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
    st.freezing = false;
  }

  return { render, reset, isDirty: () => st.dirty, resetMonth: () => { st.month = null; st.view = null; } };
})();
