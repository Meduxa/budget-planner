// Data shapes + budget math.
//
// budget   { metrics: { revenue|profit|procurement: { rows: [{id,name,type:"line"|"memo",plan[12],fact[12]}], totalFact[12] } } }
// forecast { deals: [{id, month 0-11, week 1-5, product, status, usd, gel, profit}] }
// payments { fx: {USD, EUR}, items: [{id, month 0-11, supplier, amount, currency, date "YYYY-MM-DD", status "paid"|"scheduled"}] }
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
  function normalizeForecast(doc) {
    return {
      deals: (doc?.deals || []).map((d) => ({
        id: d.id || U.uid(),
        month: clampInt(d.month, 0, 11),
        week: clampInt(d.week, 1, 5),
        product: String(d.product ?? ""),
        status: STATUS_KEYS.includes(d.status) ? d.status : STATUS_KEYS[STATUS_KEYS.length - 1],
        usd: U.toNum(d.usd),
        gel: U.toNum(d.gel),
        profit: U.toNum(d.profit),
      })),
    };
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

  // ── payments ──
  function normalizePayments(doc) {
    return {
      fx: { ...S.defaultFx, ...(doc?.fx || {}) },
      items: (doc?.items || []).map((p) => ({
        id: p.id || U.uid(),
        month: clampInt(p.month, 0, 11),
        supplier: String(p.supplier ?? ""),
        amount: U.toNum(p.amount),
        currency: S.paymentCurrencies.includes(p.currency) ? p.currency : S.paymentCurrencies[0],
        date: /^\d{4}-\d{2}-\d{2}$/.test(p.date || "") ? p.date : "",
        status: p.status === "paid" ? "paid" : "scheduled",
      })),
    };
  }

  function newPayment(month) {
    return { id: U.uid(), month, supplier: "", amount: null, currency: S.paymentCurrencies[0], date: "", status: "scheduled" };
  }

  function toBase(amount, currency, fx) {
    if (amount == null) return null;
    if (currency === S.currency) return amount;
    const rate = U.toNum(fx?.[currency]);
    return rate == null ? null : amount * rate;
  }

  BP.model = {
    METRICS, STATUS_KEYS, newRow, normalizeBudget, lineFactsIn, totals, agg, toDate, margin,
    normalizeForecast, newDeal, forecastByMonth, normalizePayments, newPayment, toBase,
  };
})();
