'use strict';
/*
 * 动作历史: every past workout that included an exercise (matched by name), with its ticked sets,
 * volume and estimated 1RM per set; a 图表 tab with the 1RM / volume trend and a 要点 tab with photos and cues.
 */

let exh = { name: '', tab: 'hist', img: null, cue: '' };
const blockName = (b) => b.title.split(' · ').slice(1).join(' · ') || b.title;

/** [{ date, title, vol, rows: [{ w, r, t, e1 }] }], newest first. */
function exerciseHistory(name) {
  const out = [];
  Object.keys(state.logs).sort().reverse().forEach((key) => {
    const l = state.logs[key];
    if (!l || !l.sets || l.offline) return;
    const date = parseKey(key);
    const sids = [...new Set([l.session, 'free'].filter(Boolean))];
    sids.forEach((sid) => {
      if (!Object.keys(l.sets).some((k) => k.startsWith(`${sid}:`))) return;
      let s;
      try { s = sessionWithExtras(state, date, sid, l); } catch { return; }
      if (!s) return;
      s.blocks.filter((b) => blockName(b) === name).forEach((b) => {
        const ticks = l.sets[`${sid}:${b.key}`] || [];
        const unit = repUnit(b);
        const rows = blockRows(state, l, sid, b).map((r, i) => {
          const w = Number(r.w) || 0;
          const reps = Number(r.plus ? (l.amrap || {})[`${sid}:${b.key}:${i}`] || r.r : r.r) || 0;
          return ticks[i] ? { w, r: reps, t: r.t, unit, e1: unit === '次' && w && reps ? Math.round(epley(w, reps) * 10) / 10 : 0 } : null;
        }).filter(Boolean);
        if (!rows.length) return;
        const title = sid === 'free' ? (l.free && l.free.title) || '自由训练' : sessionName(sid, (position(state, date) || { week: 1 }).week);
        out.push({ key, date, title, rows, vol: rows.reduce((a, r) => a + (r.t === 'warm' ? 0 : r.w * r.r), 0) });
      });
    });
  });
  return out;
}

function openExHistory(name, img, cue) {
  exh = { ...exh, name, img: img || null, cue: cue || '' };
  drawExHistory();
}
function drawExHistory() {
  const list = exerciseHistory(exh.name);
  const tabs = [['tips', '要点', 'plan'], ['hist', '历史', 'history'], ['chart', '图表', 'bars']];
  let body = '';
  if (exh.tab === 'tips') {
    body = `${exh.img ? `<div class="blk-photo"><img src="${exImgUrl(exh.img, 0)}" alt=""><img src="${exImgUrl(exh.img, 1)}" alt=""></div>` : ''}
      ${exh.cue ? `<p class="cue">${esc(exh.cue)}</p>` : '<p class="muted">这个动作还没有要点说明。</p>'}`;
  } else if (!list.length) {
    body = '<p class="muted center pad">还没有这个动作的记录。打勾完成的组会出现在这里。</p>';
  } else if (exh.tab === 'hist') {
    body = list.map((h) => `<div class="eh-card"><div class="eh-title">${esc(h.title)}</div>
      <div class="muted small">${fmtDate(h.date)} ${h.date.getFullYear()}年 ${WEEKDAYS[weekdayIdx(h.date)]}</div>
      <div class="row between eh-meta"><span>容量 ${fmtVol(h.vol)}</span>${h.rows.some((r) => r.e1) ? '<span>1RM 预测</span>' : ''}</div>
      ${h.rows.map((r, i) => `<div class="eh-row${r.t === 'warm' ? ' warm' : ''}"><span class="eh-i">${r.t === 'work' ? i + 1 : SET_TYPES[r.t][0]}</span>
        <span class="eh-set"><b>${fmtW(r.w)}</b> kg × <b>${r.r}</b> ${r.unit}</span>${r.e1 ? `<span class="eh-e1"><b>${fmtW(r.e1)}</b> kg</span>` : ''}</div>`).join('')}</div>`).join('');
  } else {
    const pts = list.slice().reverse();
    const best = pts.map((h) => ({ h, e1: Math.max(0, ...h.rows.map((r) => r.e1)), top: h.rows.reduce((a, r) => (r.w > a.w ? r : a), { w: 0, r: 0 }) }));
    const pr = best.reduce((a, x) => (x.e1 > a.e1 ? x : a), best[0]);
    const heavy = best.reduce((a, x) => (x.top.w > a.top.w ? x : a), best[0]);
    body = `${best.some((x) => x.e1) ? `<h3>估算 1RM</h3>${lineChart({ series: [{ name: '估算 1RM', cls: 's1', dots: true, points: best.filter((x) => x.e1).map((x) => ({ x: x.h.date, y: x.e1, tip: `${fmtDate(x.h.date)} · 估算 1RM ${fmtW(x.e1)}kg` })) }], height: 170 })}` : ''}
      <h3>每次容量</h3>${barChart({ bars: pts.slice(-12).map((h) => ({ label: fmtDate(h.date).replace(/月/, '/').replace('日', ''), tip: `${fmtDate(h.date)} · ${fmtVol(h.vol)}kg`, segments: [{ value: h.vol, cls: 's1' }] })), height: 150 })}
      <div class="kv"><span>练过</span><b>${list.length} 次</b></div>
      ${pr.e1 ? `<div class="kv"><span>最佳估算 1RM</span><b>${fmtW(pr.e1)}kg <span class="muted small">${fmtDate(pr.h.date)}</span></b></div>` : ''}
      <div class="kv"><span>最大重量</span><b>${fmtW(heavy.top.w)}kg × ${heavy.top.r} <span class="muted small">${fmtDate(heavy.h.date)}</span></b></div>
      <div class="kv"><span>最大单次容量</span><b>${fmtVol(Math.max(...list.map((h) => h.vol)))}kg</b></div>`;
  }
  openSheet(exh.name, `<div class="eh-tabs">${tabs.map(([k, l, ic]) => `<button data-ehtab="${k}" class="${exh.tab === k ? 'on' : ''}">${ICONS[ic] || ''}<span>${l}</span></button>`).join('')}</div>${body}`,
    { type: 'exhist', reopen: drawExHistory });
}

function bindExHistory() {
  bindChartTips($('#sheet'));
  $('#sheet').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.exhistname) {
      const it = (typeof libraryItems === 'function' ? libraryItems() : []).find((x) => x.name === b.dataset.exhistname) || {};
      exh.tab = 'hist';
      return openExHistory(b.dataset.exhistname, it.img, it.cue || (it.s || []).join('\n'));
    }
    if (sheetCtx && sheetCtx.type === 'exhist' && b.dataset.ehtab) { exh.tab = b.dataset.ehtab; drawExHistory(); }
  });
}
