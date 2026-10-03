// Shared helpers: formatting, periods, small HTML builders.
window.BP = window.BP || {};

(function () {
  const S = window.BP_CONFIG.settings;

  const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
  const ALL = [...Array(12).keys()];
  const QUARTERS = [0, 1, 2, 3].map((q) => ({ label: `Q${q + 1}`, months: [q * 3, q * 3 + 1, q * 3 + 2] }));
  const ROMAN = ["", "I", "II", "III", "IV", "V"];

  const nf0 = new Intl.NumberFormat(S.locale, { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat(S.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfRate = new Intl.NumberFormat(S.locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const money0 = new Intl.NumberFormat(S.locale, {
    style: "currency", currency: S.currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0,
  });
  const compactNf = new Intl.NumberFormat(S.locale, { notation: "compact", maximumFractionDigits: 1 });
  const pctNf = new Intl.NumberFormat(S.locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const ccyNf = {};

  const fmt = {
    num: (v) => (v == null ? "—" : nf0.format(v)),
    num2: (v) => (v == null ? "—" : nf2.format(v)),
    rate: (v) => (v == null ? "—" : nfRate.format(v)),
    money: (v) => (v == null ? "—" : money0.format(v)),
    compact: (v) => compactNf.format(v),
    pct: (v) => (v == null || !Number.isFinite(v) ? "—" : pctNf.format(v)),
    ccy(v, code) {
      if (v == null) return "—";
      ccyNf[code] ||= new Intl.NumberFormat(S.locale, {
        style: "currency", currency: code, currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      });
      return ccyNf[code].format(v);
    },
  };

  function toNum(v) {
    if (v === "" || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  const sum = (values) => values.reduce((a, v) => a + (v || 0), 0);
  const sumOrNull = (values) => (values.some((v) => v != null) ? sum(values) : null);
  const ratio = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function monthRange(months) {
    if (!months.length) return "";
    const a = MONTHS_SHORT[months[0]];
    const b = MONTHS_SHORT[months[months.length - 1]];
    return a === b ? a : `${a}–${b}`;
  }

  // Jan, Feb, Mar, Q1, Apr, …, Q4, Annual total
  function periodRows() {
    const rows = [];
    QUARTERS.forEach((q) => {
      q.months.forEach((m) => rows.push({ type: "month", label: MONTHS[m], months: [m], month: m }));
      rows.push({ type: "quarter", label: q.label, months: q.months });
    });
    rows.push({ type: "annual", label: "Annual total", months: ALL });
    return rows;
  }

  function segmented(name, options, value, label) {
    return `<div class="seg" role="group" aria-label="${esc(label || name)}" data-seg="${name}">${options.map((o) =>
      `<button type="button" data-value="${esc(o.value)}" aria-pressed="${o.value === value}">${esc(o.label)}</button>`).join("")}</div>`;
  }

  function editActions(editing) {
    return editing
      ? `<button class="btn" data-action="cancel">Cancel</button><button class="btn primary" data-action="save">Save</button>`
      : `<button class="btn" data-action="edit">Edit</button>`;
  }

  function isoToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  BP.util = {
    S, MONTHS, MONTHS_SHORT, ALL, QUARTERS, ROMAN, fmt,
    toNum, sum, sumOrNull, ratio, uid, clone, esc, monthRange, periodRows, segmented, editActions, isoToday,
  };
})();
