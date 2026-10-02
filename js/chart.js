// 12-month bar chart in plain SVG: grouped (plan vs actual) or stacked
// (forecast by status), with optional target markers and a hover tooltip.
//
// BP.chart.render(container, {
//   series: [{ label, color, values[12] }], stacked?: bool,
//   target?: { label, values[12] }, extra?: (monthIndex) => [[label, text], …],
//   format: (v) => string, ariaLabel })
(function () {
  const U = BP.util;
  const NS = "http://www.w3.org/2000/svg";
  const observer = new ResizeObserver((entries) => entries.forEach((e) => draw(e.target)));

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function niceStep(range, count = 5) {
    const raw = range / count;
    const p = 10 ** Math.floor(Math.log10(raw));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  // Bar from y0 (baseline side) to y1 (value side); value side optionally rounded.
  function barPath(x, w, y0, y1, r) {
    const h = Math.abs(y1 - y0);
    if (h < 0.5) return "";
    r = Math.min(r, w / 2, h);
    const d = y1 < y0 ? 1 : -1;
    return `M${x},${y0}V${y1 + d * r}Q${x},${y1} ${x + r},${y1}` +
      `H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + d * r}V${y0}Z`;
  }

  function render(container, opts) {
    container._chart = opts;
    if (!container._observed) { observer.observe(container); container._observed = true; }
    draw(container);
  }

  function draw(container) {
    if (!container.isConnected) { observer.unobserve(container); return; }
    const o = container._chart;
    if (!o) return;
    const width = Math.max(container.clientWidth, 280);
    if (container._w === width && container._drawn === o) return; // resize noise
    container._w = width;
    container._drawn = o;

    const height = o.height || 280;
    const narrow = width < 560;
    const m = { top: 26, right: 8, bottom: 28, left: 52 };
    const plotW = width - m.left - m.right;
    const plotH = height - m.top - m.bottom;

    const vals = [0];
    for (let i = 0; i < 12; i++) {
      if (o.stacked) vals.push(o.series.reduce((a, s) => a + Math.max(0, s.values[i] || 0), 0));
      else o.series.forEach((s) => vals.push(s.values[i] || 0));
      if (o.target) vals.push(o.target.values[i] || 0);
    }
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi === lo) hi = lo + 1;
    const step = niceStep(hi - lo);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const y = (v) => m.top + plotH - ((v - lo) / (hi - lo)) * plotH;

    container.replaceChildren();
    const svg = el("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img",
      "aria-label": o.ariaLabel || "Monthly chart. Exact values are in the table." }, container);

    for (let v = lo; v <= hi + step / 2; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      el("line", { x1: m.left, x2: width - m.right, y1: yy, y2: yy, class: Math.abs(v) < step / 1e6 ? "axis-base" : "grid" }, svg);
      el("text", { x: m.left - 8, y: yy, class: "tick", "text-anchor": "end", "dominant-baseline": "middle" }, svg)
        .textContent = U.fmt.compact(v);
    }

    const groupW = plotW / 12;
    for (let q = 0; q < 4; q++) {
      const x0 = m.left + q * 3 * groupW;
      if (q > 0) el("line", { x1: x0, x2: x0, y1: m.top - 18, y2: m.top + plotH, class: "q-sep" }, svg);
      el("text", { x: x0 + 1.5 * groupW, y: m.top - 10, class: "q-label", "text-anchor": "middle" }, svg).textContent = `Q${q + 1}`;
    }

    const wash = el("rect", { class: "hover-wash", y: m.top, height: plotH, width: groupW, rx: 6, opacity: 0 }, svg);
    const y0 = y(0);
    const gap = 2;
    const n = o.series.length;
    const barW = o.stacked
      ? Math.max(6, Math.min(30, groupW * 0.56))
      : Math.max(3, Math.min(20, (groupW * 0.72 - gap * (n - 1)) / n));
    const clusterW = o.stacked ? barW : barW * n + gap * (n - 1);

    for (let i = 0; i < 12; i++) {
      const gx = m.left + i * groupW;
      const cx = gx + (groupW - clusterW) / 2;
      if (o.stacked) {
        const segs = o.series.map((s) => ({ s, v: Math.max(0, s.values[i] || 0) })).filter((x) => x.v > 0);
        let acc = 0;
        segs.forEach((seg, k) => {
          const isTop = k === segs.length - 1;
          const yb = y(acc) - (k > 0 ? gap / 2 : 0);
          const yt = y(acc + seg.v) + (isTop ? 0 : gap / 2);
          const d = isTop ? barPath(cx, barW, yb, yt, 4) : (yb - yt > 0.5 ? `M${cx},${yb}V${yt}H${cx + barW}V${yb}Z` : "");
          if (d) el("path", { d, fill: seg.s.color }, svg);
          acc += seg.v;
        });
      } else {
        o.series.forEach((s, k) => {
          const v = s.values[i];
          if (v == null) return;
          const d = barPath(cx + k * (barW + gap), barW, y0, y(v), 4);
          if (d) el("path", { d, fill: s.color }, svg);
        });
      }
      const t = o.target?.values[i];
      if (t) {
        const ty = Math.round(y(t));
        el("line", { x1: cx - 5, x2: cx + clusterW + 5, y1: ty, y2: ty, class: "target-mark" }, svg);
      }
      el("text", { x: gx + groupW / 2, y: height - 8, class: "tick", "text-anchor": "middle" }, svg)
        .textContent = narrow ? U.MONTHS_SHORT[i][0] : U.MONTHS_SHORT[i];
    }

    const tip = document.createElement("div");
    tip.className = "tooltip";
    tip.hidden = true;
    container.appendChild(tip);

    for (let i = 0; i < 12; i++) {
      const gx = m.left + i * groupW;
      const hit = el("rect", { x: gx, y: m.top, width: groupW, height: plotH, fill: "transparent" }, svg);
      hit.addEventListener("pointerenter", () => {
        wash.setAttribute("x", gx);
        wash.setAttribute("opacity", 1);
        let html = `<div class="tip-title">${U.MONTHS[i]}</div>`;
        html += o.series.map((s) => `<div class="tip-row"><span class="sw" style="background:${s.color}"></span>` +
          `<span>${U.esc(s.label)}</span><b>${o.format(s.values[i])}</b></div>`).join("");
        if (o.target) {
          html += `<div class="tip-row"><span class="sw-line"></span><span>${U.esc(o.target.label)}</span><b>${o.format(o.target.values[i])}</b></div>`;
        }
        const extra = o.extra ? o.extra(i) : [];
        if (extra.length) {
          html += `<div class="tip-foot">${extra.map(([k, v]) =>
            `<div class="tip-row"><span></span><span>${U.esc(k)}</span><b>${v}</b></div>`).join("")}</div>`;
        }
        tip.innerHTML = html;
        tip.hidden = false;
        const tw = tip.offsetWidth;
        let left = gx + groupW + 8;
        if (left + tw > width) left = gx - tw - 8;
        tip.style.left = `${Math.max(0, left)}px`;
        tip.style.top = `${m.top}px`;
      });
      hit.addEventListener("pointerleave", () => {
        wash.setAttribute("opacity", 0);
        tip.hidden = true;
      });
    }
  }

  function legend(series, target) {
    return series.map((s) =>
      `<span class="legend-item"><span class="sw" style="background:${s.color}"></span>${U.esc(s.label)}</span>`).join("") +
      (target ? `<span class="legend-item"><span class="sw-line"></span>${U.esc(target.label)}</span>` : "");
  }

  BP.chart = { render, legend };
})();
