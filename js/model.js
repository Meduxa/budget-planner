// Data shapes + budget math.
//
// budget   { metrics: { revenue|profit|procurement: { rows: [{id,name,type:"line"|"memo",plan[12],fact[12]}], totalFact[12] } } }
// forecast { deals: [{id, month 0-11, week 1-5, product, status, usd, gel, profit}] }
// payments { fx: {USD, EUR} (defaults for new payments),
//            items: [{id, month 0-11, supplier, category, amount, currency, rate, date "YYYY-MM-DD", status "paid"|"scheduled"}] }
//            Paid payments are the Procurement actuals (GEL = amount × own rate).
//
// Totals: plan = sum of "line" rows (memo rows are "of which" info, never added).
// Actual  = sum of line actuals when any line has an actual that month,
//           otherwise the actual typed on the total row (totalFact).
// Margin  = profit ÷ revenue at every level, never an average of margins.
(function () {
  const U = BP.util;
  const S = U.S;

  const METRICS = [
    { key: "revenue", label: "Revenue", hint: "excl. VAT" },
    { key: "profit", label: "Profit", hint: "" },
    { key: "procurement", label: "Procurement", hint: "" },
  ];
  const STATUS_KEYS = S.dealStatuses.map((s) => s.key);

  const n12 = () => Array(12).fill(null);
  function arr12(a) {
    const out = n12();
    if (Array.isArray(a)) a.slice(0, 12).forEach((v, i) => { out[i] = U.toNum(v); });
    return out;
  }
  const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || lo));

  function newRow(name = "", type = "line") {
    return { id: U.uid(), name, type, plan: n12(), fact: n12() };
  }

  function defaultMetric(key) {
    const rows = S.categories.map((n) => newRow(n));
    (S.memoLines?.[key] || []).forEach((n) => rows.push(newRow(n, "memo")));
    return { rows, totalFact: n12() };
  }

  function normalizeBudget(doc) {
    const metrics = {};
    for (const { key } of METRICS) {
      const src = doc?.metrics?.[key];
      metrics[key] = src && Array.isArray(src.rows)
        ? {
          rows: src.rows.map((r) => ({
            id: r.id || U.uid(),
            name: String(r.name ?? ""),
            type: r.type === "memo" ? "memo" : "line",
            plan: arr12(r.plan),
            fact: arr12(r.fact),
          })),
          totalFact: arr12(src.totalFact),
        }
        : defaultMetric(key);
    }
    return { metrics };
  }

  const lineFactsIn = (metric, m) => metric.rows.some((r) => r.type === "line" && r.fact[m] != null);

  function totals(metric) {
    const lines = metric.rows.filter((r) => r.type === "line");
    return {
      plan: n12().map((_, m) => U.sumOrNull(lines.map((r) => r.plan[m]))),
      fact: n12().map((_, m) => (lineFactsIn(metric, m) ? U.sum(lines.map((r) => r.fact[m])) : metric.totalFact[m])),
    };
  }

  // Aggregate a {plan[], fact[]} series over some months.
  function agg(series, months) {
    const plan = U.sumOrNull(months.map((m) => series.plan[m]));
    const fact = U.sumOrNull(months.map((m) => series.fact[m]));
    return { plan, fact, pct: U.ratio(fact, plan) };
  }

  // Plan vs actual for only the months that already have actuals.
  function toDate(series) {
    const months = U.ALL.filter((m) => series.fact[m] != null);
    return { months, ...agg(series, months) };
  }

  function margin(rev, prof, months) {
    const plan = U.ratio(U.sumOrNull(months.map((m) => prof.plan[m])), U.sumOrNull(months.map((m) => rev.plan[m])));
    const both = months.filter((m) => rev.fact[m] != null && prof.fact[m] != null);
    const fact = both.length ? U.ratio(U.sum(both.map((m) => prof.fact[m])), U.sum(both.map((m) => rev.fact[m]))) : null;
    return { plan, fact };
  }

  // ── forecast ──
  // A snapshot freezes the whole forecast (all deals) plus the revenue target and
  // actuals of that moment, so a reported weekly plan can be shown later unchanged.
  function normalizeForecast(doc) {
    return {
      deals: normalizeDeals(doc?.deals),
      snapshots: (doc?.snapshots || []).map((s) => ({
        id: s.id || U.uid(),
        name: String(s.name ?? "Snapshot"),
        savedAt: String(s.savedAt || ""),
        savedBy: s.savedBy ?? null,
        deals: normalizeDeals(s.deals),
        target: { plan: arr12(s.target?.plan), fact: arr12(s.target?.fact) },
      })),
    };
  }

  function makeSnapshot(name, deals, revenueTotals, savedBy) {
    return {
      id: U.uid(),
      name,
      savedAt: new Date().toISOString(),
      savedBy: savedBy ?? null,
      deals: JSON.parse(JSON.stringify(deals)),
      target: { plan: [...revenueTotals.plan], fact: [...revenueTotals.fact] },
    };
  }

  function normalizeDeals(list) {
    return (list || []).map((d) => ({
      id: d.id || U.uid(),
      month: clampInt(d.month, 0, 11),
      week: clampInt(d.week, 1, 5),
      product: String(d.product ?? ""),
      status: STATUS_KEYS.includes(d.status) ? d.status : STATUS_KEYS[STATUS_KEYS.length - 1],
      usd: U.toNum(d.usd),
      gel: U.toNum(d.gel),
      profit: U.toNum(d.profit),
    }));
  }

  function newDeal(month, week) {
    return { id: U.uid(), month, week, product: "", status: STATUS_KEYS[STATUS_KEYS.length - 1], usd: null, gel: null, profit: null };
  }

  // [month] → { statusKey: GEL sum }
  function forecastByMonth(deals) {
    const out = U.ALL.map(() => Object.fromEntries(STATUS_KEYS.map((k) => [k, 0])));
    deals.forEach((d) => { out[d.month][d.status] += d.gel || 0; });
    return out;
  }

  // Per month: actual revenue if the month has one, otherwise the sales forecast.
  // outlook = actual for closed months + forecast for open months.
  function outlookByMonth(revenue, byMonth) {
    return U.ALL.map((m) => {
      const forecast = U.sum(STATUS_KEYS.map((k) => byMonth[m][k]));
      const actual = revenue.fact[m];
      return { actual, forecast, open: actual == null, outlook: actual != null ? actual : forecast };
    });
  }

  // ── payments ──
  // Each payment keeps its OWN exchange rate (GEL per 1 unit), fixed when it is
  // entered, so later changes to the default rate never alter past payments.
  // `fx` holds only the defaults pre-filled on new payments.
  const defaultRate = (currency, fx) => (currency === S.currency ? 1 : U.toNum(fx?.[currency]));

  function normalizePayments(doc) {
    const fx = { ...S.defaultFx, ...(doc?.fx || {}) };
    return {
      fx,
      items: (doc?.items || []).map((p) => {
        const currency = S.paymentCurrencies.includes(p.currency) ? p.currency : S.paymentCurrencies[0];
        return {
          id: p.id || U.uid(),
          month: clampInt(p.month, 0, 11),
          supplier: String(p.supplier ?? ""),
          category: S.paymentCategories.includes(p.category) ? p.category : "",
          amount: U.toNum(p.amount),
          currency,
          // older payments had no rate of their own: fix them at the rate saved with them
          rate: currency === S.currency ? 1 : (U.toNum(p.rate) ?? defaultRate(currency, fx)),
          date: /^\d{4}-\d{2}-\d{2}$/.test(p.date || "") ? p.date : "",
          status: p.status === "paid" ? "paid" : "scheduled",
        };
      }),
    };
  }

  function newPayment(month, fx) {
    const currency = S.paymentCurrencies[0];
    return { id: U.uid(), month, supplier: "", category: "", amount: null, currency,
      rate: defaultRate(currency, fx), date: "", status: "scheduled" };
  }

  // Payment value in GEL at its own rate.
  function paymentBase(p) {
    if (p.amount == null) return null;
    const rate = p.currency === S.currency ? 1 : U.toNum(p.rate);
    return rate == null ? null : p.amount * rate;
  }

  // Paid payments in GEL → { label: [12 months] } ("" = no label)
  function paidByLabel(payments) {
    const out = {};
    (payments?.items || []).forEach((p) => {
      const v = p.status === "paid" ? paymentBase(p) : null;
      if (v == null) return;
      const arr = (out[p.category || ""] ||= n12());
      arr[p.month] = (arr[p.month] || 0) + v;
    });
    return out;
  }

  // Procurement with Actuals taken from paid supplier payments (in GEL):
  // each budget line gets the paid payments whose label matches its name.
  // Paid payments with no label (or a label matching no line) go on a
  // "Not labelled" line so the total always equals everything paid.
  const UNLABELLED_ID = "__unlabelled";
  function procurementActuals(metric, payments) {
    const paid = paidByLabel(payments);
    const lineNames = new Set(metric.rows.filter((r) => r.type === "line").map((r) => r.name));
    const rows = metric.rows.map((r) => (r.type === "line" ? { ...r, fact: paid[r.name] ? [...paid[r.name]] : n12() } : r));
    const orphan = n12();
    Object.entries(paid).forEach(([label, arr]) => {
      if (lineNames.has(label)) return;
      arr.forEach((v, m) => { if (v != null) orphan[m] = (orphan[m] || 0) + v; });
    });
    if (orphan.some((v) => v != null)) {
      const lastLine = rows.map((r) => r.type).lastIndexOf("line");
      rows.splice(lastLine + 1, 0, { id: UNLABELLED_ID, name: "Not labelled (supplier payments)", type: "line",
        derived: true, plan: n12(), fact: orphan });
    }
    return { rows, totalFact: n12() };
  }

  // Budget as shown everywhere: procurement actuals come from paid payments.
  function withPaymentActuals(budget, payments) {
    return { metrics: { ...budget.metrics, procurement: procurementActuals(budget.metrics.procurement, payments) } };
  }

  BP.model = {
    METRICS, STATUS_KEYS, newRow, normalizeBudget, lineFactsIn, totals, agg, toDate, margin,
    normalizeForecast, makeSnapshot, newDeal, forecastByMonth, outlookByMonth,
    normalizePayments, newPayment, defaultRate, paymentBase, procurementActuals, withPaymentActuals,
  };
})();
