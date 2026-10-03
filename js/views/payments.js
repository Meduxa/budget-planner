// Supplier payments: scheduled and completed transfers by month, each with a
// label (budget line) and its OWN exchange rate, fixed when it is entered.
// Paid payments feed Procurement → Actual (in GEL) on the Dashboard and in Budget detail.
BP.views = BP.views || {};
BP.views.payments = (function () {
  const U = BP.util;
  const M = BP.model;
  const { fmt, esc } = U;
  const CURR = U.S.paymentCurrencies;
  const LABELS = U.S.paymentCategories;
  const BASE = U.S.currency;
  const FX_CURR = CURR.filter((c) => c !== BASE);

  const st = { editing: false, draft: null, dirty: false };
  const doc = (app) => (st.editing ? st.draft : app.data.payments);

  function stateOf(p, today) {
    if (p.status === "paid") return "paid";
    return p.date && p.date < today ? "overdue" : "scheduled";
  }

  const BADGE = {
    paid: `<span class="badge good">✓ Paid</span>`,
    scheduled: `<span class="badge">Scheduled</span>`,
    overdue: `<span class="badge critical">! Overdue</span>`,
  };

  function byCurrency(items) {
    const out = {};
    items.forEach((p) => { if (p.amount != null) out[p.currency] = (out[p.currency] || 0) + p.amount; });
    return out;
  }
  const ccyList = (sums) => Object.keys(sums).length
    ? Object.entries(sums).map(([c, v]) => `<div>${fmt.ccy(v, c)}</div>`).join("")
    : "<div>—</div>";
  const baseTotal = (items) => U.sumOrNull(items.map(M.paymentBase));

  function render(el, app) {
    const d = doc(app);
    const fxLine = FX_CURR.map((c) => st.editing
      ? `<label class="fx">1 ${c} = <input type="number" step="any" inputmode="decimal" data-fx="${c}" value="${d.fx[c] ?? ""}" aria-label="Default ${BASE} per ${c}"> ${BASE}</label>`
      : `<span>1 ${c} = <b>${fmt.rate(U.toNum(d.fx[c]))}</b> ${BASE}</span>`).join("");

    el.innerHTML = `
      <div class="view-head">
        <div><h2>Supplier payments ${app.year}</h2>
          <p class="sub">${st.editing
            ? "Each payment keeps its own exchange rate. Paid payments are added to Procurement → Actual for their label and month."
            : "Scheduled and completed payments to suppliers. Paid payments count as Procurement actuals (in GEL)."}</p></div>
        <div class="actions">${U.editActions(st.editing)}</div>
      </div>
      <div class="kpis" id="payKpis"></div>
      <div class="card">
        <div class="card-head">
          <h3>Payments by month</h3>
          <div class="fx-line">Default rate for new payments: ${fxLine}</div>
        </div>
        <div class="table-wrap">${tableHtml(app)}</div>
      </div>`;

    updateComputed(el, app);
    bind(el, app);
  }

  function updateComputed(el, app) {
    const d = doc(app);
    const today = U.isoToday();
    const soon = new Date(); soon.setDate(soon.getDate() + 30);
    const soonIso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;

    const open = d.items.filter((p) => p.status !== "paid");
    const overdue = open.filter((p) => stateOf(p, today) === "overdue");
    const next30 = open.filter((p) => p.date && p.date >= today && p.date <= soonIso);
    const paid = d.items.filter((p) => p.status === "paid");
    const unlabelledPaid = paid.filter((p) => !p.category).length;

    const tile = (label, items, note) => `<div class="kpi">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value ccy-list">${ccyList(byCurrency(items))}</div>
      <div class="kpi-note">${items.length ? `≈ ${fmt.money(baseTotal(items))} · ` : ""}${note}</div>
    </div>`;
    el.querySelector("#payKpis").innerHTML =
      tile("Still to pay", open, `${open.length} payment${open.length === 1 ? "" : "s"}`) +
      tile("Overdue", overdue, overdue.length ? "scheduled date has passed" : "nothing overdue") +
      tile("Due in the next 30 days", next30, next30.length ? "with a date set" : "no dated payments due") +
      tile(`Paid in ${app.year}`, paid, unlabelledPaid
        ? `<span class="neg">${unlabelledPaid} without a label</span>`
        : `${paid.length} payments, all labelled`);

    el.querySelectorAll("[data-calc]").forEach((node) => {
      const [scope, what] = node.dataset.calc.split("|");
      const items = d.items.filter((p) => String(p.month) === scope);
      node.innerHTML = what === "ccy" ? ccyList(byCurrency(items)) : fmt.money(baseTotal(items));
    });
    el.querySelectorAll("[data-base]").forEach((node) => {
      const p = d.items.find((x) => x.id === node.dataset.base);
      node.textContent = p ? fmt.num2(M.paymentBase(p)) : "";
    });
  }

  function tableHtml(app) {
    const d = doc(app);
    const today = U.isoToday();
    const months = U.ALL.filter((m) => st.editing || d.items.some((p) => p.month === m));
    if (!months.length) return `<p class="empty">No payments for ${app.year} yet. Click <b>Edit</b> to add them.</p>`;
    const cols = st.editing ? 9 : 7;

    const body = months.map((m) => {
      let items = d.items.filter((p) => p.month === m);
      if (!st.editing) items = [...items].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
      const rows = items.map((p) => (st.editing ? editRow(p) : viewRow(p, today))).join("");
      const totalRow = st.editing
        ? `<th scope="row">${U.MONTHS[m]} total</th><td></td><td class="num" data-calc="${m}|ccy"></td><td></td><td></td><td></td><td></td>
           <td class="num" data-calc="${m}|base"></td><td></td>`
        : `<th scope="row">${U.MONTHS[m]} total</th><td></td><td class="num" data-calc="${m}|ccy"></td><td></td><td></td><td></td>
           <td class="num" data-calc="${m}|base"></td>`;
      return `<tbody>
        <tr class="row-section"><th colspan="${cols}">${U.MONTHS[m]}</th></tr>
        ${rows}
        ${st.editing ? `<tr class="row-add"><td colspan="${cols}"><button class="btn small" data-add-month="${m}">+ Add payment in ${U.MONTHS[m]}</button></td></tr>` : ""}
        ${items.length ? `<tr class="row-quarter">${totalRow}</tr>` : ""}
      </tbody>`;
    }).join("");

    const head = st.editing
      ? `<th>Supplier</th><th>Label</th><th class="num">Amount</th><th>Currency</th><th class="num">Rate</th>
         <th>Date</th><th>Status</th><th class="num">${BASE}</th><th></th>`
      : `<th>Supplier</th><th>Label</th><th class="num">Amount</th><th class="num">Rate</th>
         <th>Date</th><th>Status</th><th class="num">${BASE}</th>`;
    return `<table class="data-table pay-table${st.editing ? " editing" : ""}">
      <caption>${BASE} = amount × the payment's own rate. Paid payments are added to Procurement → Actual.</caption>
      <thead><tr>${head}</tr></thead>
      ${body}
    </table>`;
  }

  function viewRow(p, today) {
    const s = stateOf(p, today);
    const label = p.category
      ? esc(p.category)
      : `<span class="${p.status === "paid" ? "neg" : "muted"}">no label</span>`;
    return `<tr class="${s === "overdue" ? "is-overdue" : ""}">
      <td>${esc(p.supplier)}</td>
      <td>${label}</td>
      <td class="num">${p.amount == null ? "—" : fmt.ccy(p.amount, p.currency)}</td>
      <td class="num">${p.currency === BASE ? "" : fmt.rate(p.rate)}</td>
      <td>${p.date ? new Date(`${p.date}T00:00`).toLocaleDateString(U.S.locale, { day: "numeric", month: "short" }) : "<span class=muted>no date</span>"}</td>
      <td>${BADGE[s]}</td>
      <td class="num" data-base="${p.id}"></td>
    </tr>`;
  }

  function editRow(p) {
    return `<tr>
      <td><input class="text-input" data-pay="${p.id}" data-field="supplier" value="${esc(p.supplier)}" aria-label="Supplier"></td>
      <td><select data-pay="${p.id}" data-field="category" aria-label="Label">
        <option value=""${p.category ? "" : " selected"}>— choose —</option>
        ${LABELS.map((c) => `<option${c === p.category ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></td>
      <td class="num"><input type="number" step="any" inputmode="decimal" data-pay="${p.id}" data-field="amount" value="${p.amount ?? ""}" aria-label="Amount"></td>
      <td><select data-pay="${p.id}" data-field="currency" aria-label="Currency">${CURR.map((c) =>
        `<option${c === p.currency ? " selected" : ""}>${c}</option>`).join("")}</select></td>
      <td class="num"><input class="rate-input" type="number" step="any" inputmode="decimal" data-pay="${p.id}" data-field="rate"
        value="${p.currency === BASE ? 1 : (p.rate ?? "")}"${p.currency === BASE ? " disabled" : ""}
        aria-label="Exchange rate, ${BASE} per 1 ${p.currency}" title="${BASE} per 1 ${p.currency} on the day of payment"></td>
      <td><input type="date" data-pay="${p.id}" data-field="date" value="${p.date}" aria-label="Date"></td>
      <td><select data-pay="${p.id}" data-field="status" aria-label="Status">
        <option value="scheduled"${p.status === "scheduled" ? " selected" : ""}>Scheduled</option>
        <option value="paid"${p.status === "paid" ? " selected" : ""}>Paid</option></select></td>
      <td class="num" data-base="${p.id}"></td>
      <td><button class="icon-btn" data-del="${p.id}" aria-label="Remove payment" title="Remove payment">×</button></td>
    </tr>`;
  }

  function bind(el, app) {
    el.onclick = async (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "edit") {
        st.editing = true; st.dirty = false; st.draft = U.clone(app.data.payments); render(el, app);
      } else if (action === "cancel") {
        if (st.dirty && !confirm("Discard unsaved changes?")) return;
        reset(); render(el, app);
      } else if (action === "save") {
        const items = st.draft.items.filter((p) => p.supplier.trim() || p.amount != null);
        const noLabel = items.filter((p) => p.status === "paid" && !p.category).length;
        const noRate = items.filter((p) => p.currency !== BASE && p.amount != null && U.toNum(p.rate) == null).length;
        const warnings = [
          noLabel && `${noLabel} paid payment(s) have no label — they'll show as "Not labelled" in Procurement.`,
          noRate && `${noRate} payment(s) have no exchange rate — they can't be counted in ${BASE}.`,
        ].filter(Boolean);
        if (warnings.length && !confirm(`${warnings.join("\n")}\n\nSave anyway?`)) return;
        if (await app.save("payments", { fx: st.draft.fx, items })) { reset(); render(el, app); }
      }
      const add = e.target.closest("[data-add-month]");
      if (add) {
        const p = M.newPayment(Number(add.dataset.addMonth), st.draft.fx);
        st.draft.items.push(p);
        st.dirty = true;
        render(el, app);
        el.querySelector(`[data-pay="${p.id}"][data-field=supplier]`)?.focus();
      }
      const del = e.target.closest("[data-del]");
      if (del) {
        st.draft.items = st.draft.items.filter((p) => p.id !== del.dataset.del);
        st.dirty = true;
        render(el, app);
      }
    };
    const onEdit = (e) => {
      const t = e.target;
      if (!st.draft) return;
      if (t.dataset.fx) {
        // default only — existing payments keep their own rate
        st.draft.fx[t.dataset.fx] = U.toNum(t.value);
      } else if (t.dataset.pay) {
        const p = st.draft.items.find((x) => x.id === t.dataset.pay);
        if (!p) return;
        const f = t.dataset.field;
        if (f === "amount" || f === "rate") p[f] = U.toNum(t.value);
        else p[f] = t.value;
        if (f === "currency" && e.type === "change") {
          // switching currency: start from that currency's default rate
          p.rate = M.defaultRate(p.currency, st.draft.fx);
          const rateIn = el.querySelector(`[data-pay="${p.id}"][data-field=rate]`);
          rateIn.value = p.rate ?? "";
          rateIn.disabled = p.currency === BASE;
          rateIn.title = `${BASE} per 1 ${p.currency} on the day of payment`;
        }
      } else return;
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

  return { render, reset, isDirty: () => st.dirty };
})();
