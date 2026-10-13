'use strict';
/* Tiny inline-SVG charts. Colours come from CSS variables (--viz-*), so light/dark mode is handled in styles.css. */

const VIZ_W = 340;
const escT = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 5; max += 5; }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

/**
 * Line chart over dates.
 * series: [{ name, cls, points: [{ x: Date, y, tip }], step, dashed, dots, diamond }]
 */
function lineChart({ series, height = 200, unit = 'kg' }) {
  const all = series.flatMap((s) => s.points);
  if (!all.length) return '';
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const H = height, W = VIZ_W;
  const xs = all.map((p) => +p.x), ys = all.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 86400000 * 7; x1 += 86400000 * 7; }
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = (x) => pad.l + ((+x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const Y = (y) => H - pad.b - ((y - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);

  let g = ticks.map((t) => `<line class="viz-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(t)}" y2="${Y(t)}"/>
    <text class="viz-axis" x="${pad.l - 6}" y="${Y(t) + 4}" text-anchor="end">${t}</text>`).join('');
  const xt = [x0, (x0 + x1) / 2, x1];
  g += xt.map((x, i) => `<text class="viz-axis" x="${X(x)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${md(new Date(x))}</text>`).join('');

  series.forEach((s) => {
    const pts = s.points.slice().sort((a, b) => a.x - b.x);
    if (!pts.length) return;
    let d = `M${X(pts[0].x)},${Y(pts[0].y)}`;
    pts.slice(1).forEach((p, i) => {
      d += s.step ? `H${X(p.x)}V${Y(p.y)}` : `L${X(p.x)},${Y(p.y)}`;
      void i;
    });
    if (s.step) d += `H${X(x1)}`;
    if (pts.length > 1 || s.step) g += `<path class="viz-line ${s.cls}${s.dashed ? ' dashed' : ''}" d="${d}"/>`;
    if (s.dots || s.diamond) pts.forEach((p) => {
      const cx = X(p.x), cy = Y(p.y);
      g += s.diamond
        ? `<path class="viz-dot ${s.cls}" d="M${cx},${cy - 6}L${cx + 6},${cy}L${cx},${cy + 6}L${cx - 6},${cy}Z"/>`
        : `<circle class="viz-dot ${s.cls}" cx="${cx}" cy="${cy}" r="4.5"/>`;
    });
    pts.forEach((p) => { if (p.tip) g += `<circle class="viz-hit" cx="${X(p.x)}" cy="${Y(p.y)}" r="14" data-tip="${escT(p.tip)}"/>`; });
    // Direct label at the last point
    if (s.label !== false) {
      const p = pts[pts.length - 1];
      g += `<text class="viz-label" x="${Math.min(X(s.step ? x1 : p.x), W - pad.r)}" y="${Y(p.y) - 8}" text-anchor="end">${escT(p.y)}${unit}</text>`;
    }
  });
  return `<svg class="viz" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

/** Stacked bars. bars: [{ label, tip, segments: [{ value, cls }] }] */
function barChart({ bars, height = 180, unit = '' }) {
  if (!bars.length) return '';
  const pad = { l: 36, r: 8, t: 12, b: 24 };
  const H = height, W = VIZ_W;
  const max = Math.max(1, ...bars.map((b) => b.segments.reduce((a, s) => a + s.value, 0)));
  const ticks = niceTicks(0, max, 3);
  const top = ticks[ticks.length - 1];
  const Y = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);
  const slot = (W - pad.l - pad.r) / bars.length;
  const bw = Math.min(24, slot * 0.7);
  let g = ticks.map((t) => `<line class="viz-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(t)}" y2="${Y(t)}"/>
    <text class="viz-axis" x="${pad.l - 6}" y="${Y(t) + 4}" text-anchor="end">${t}${unit}</text>`).join('');
  bars.forEach((b, i) => {
    const x = pad.l + slot * i + (slot - bw) / 2;
    let acc = 0;
    const segs = b.segments.filter((s) => s.value > 0);
    segs.forEach((s, j) => {
      const yTop = Y(acc + s.value), yBot = Y(acc) - (j > 0 ? 2 : 0); // 2px gap between stacked segments
      const h = Math.max(0, yBot - yTop);
      const r = j === segs.length - 1 ? Math.min(4, h) : 0;
      g += `<path class="viz-bar ${s.cls}" d="M${x},${yBot}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + bw - r}Q${x + bw},${yTop} ${x + bw},${yTop + r}V${yBot}Z"/>`;
      acc += s.value;
    });
    if (i % Math.ceil(bars.length / 6) === 0 || i === bars.length - 1) g += `<text class="viz-axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${escT(b.label)}</text>`;
    g += `<rect class="viz-hit" x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${H - pad.t - pad.b}" data-tip="${escT(b.tip)}"/>`;
  });
  return `<svg class="viz" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

/** Calendar heatmap: weeks as columns (oldest left), Mon–Sun as rows. cells[w][d] = { cls, tip } */
function calendarChart(cells, weekLabels) {
  const cs = 16, gap = 3, padL = 26, padT = 4;
  const W = padL + cells.length * (cs + gap), H = padT + 7 * (cs + gap) + 18;
  let g = ['一', '', '三', '', '五', '', '日'].map((l, i) => l && `<text class="viz-axis" x="${padL - 6}" y="${padT + i * (cs + gap) + 12}" text-anchor="end">${l}</text>`).join('');
  cells.forEach((col, w) => {
    col.forEach((c, d) => {
      const x = padL + w * (cs + gap), y = padT + d * (cs + gap);
      g += `<rect class="viz-cell ${c.cls}" x="${x}" y="${y}" width="${cs}" height="${cs}" rx="3"${c.tip ? ` data-tip="${escT(c.tip)}"` : ''}/>`;
    });
    if (weekLabels[w]) g += `<text class="viz-axis" x="${padL + w * (cs + gap)}" y="${H - 4}">${escT(weekLabels[w])}</text>`;
  });
  return `<svg class="viz cal" viewBox="0 0 ${W} ${H}" style="max-width:${W * 1.4}px" role="img">${g}</svg>`;
}

/* Shared tooltip: hover on desktop, tap on phones. */
function bindChartTips(root) {
  let tip = document.getElementById('vizTip');
  if (!tip) { tip = Object.assign(document.createElement('div'), { id: 'vizTip', className: 'viz-tip' }); tip.hidden = true; document.body.appendChild(tip); }
  const show = (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t || !root.contains(t)) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute('data-tip');
    tip.hidden = false;
    const r = t.getBoundingClientRect();
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2));
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 8) + window.scrollY}px`;
  };
  root.addEventListener('pointerover', show);
  root.addEventListener('pointerdown', show);
  root.addEventListener('pointerleave', () => (tip.hidden = true));
  window.addEventListener('scroll', () => (tip.hidden = true), { passive: true });
}
