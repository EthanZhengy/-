'use strict';
/* ================= 挑战: the 12-week program ================= */

const BADGE = {
  app: '<span class="badge app">✓ App 完成</span>',
  offline: '<span class="badge offline">📝 App 外完成</span>',
  missed: '<span class="badge missed">未完成</span>',
  upcoming: '',
};

function weekPreviewHtml(st, weekAbs, compact, withStatus) {
  const week = (weekAbs % 12) + 1;
  const start = addDays(parseKey(st.startDate), weekAbs * 7);
  const today = new Date();
  return orderFor(week).map((sid, i) => {
    const stat = withStatus ? sessionStatus(st, weekAbs, sid, today) : null;
    const date = stat ? stat.date : addDays(start, st.schedule[i] ?? i);
    const s = buildSession(st, date, sid, {});
    if (!s) return '';
    const lines = s.blocks.map((b) => {
      if (b.type === 'main') return `<div><b>${esc(b.title.replace(/^主项 · /, ''))}</b> ${b.rows.filter((r) => !r.label || !r.label.startsWith('热身')).map((r) => `${fmtW(r.w)}×${r.reps}${r.plus ? '+' : ''}`).join(' · ')}</div>`;
      if (compact) return '';
      return `<div class="muted">${esc(b.title)}${b.w ? ` ${fmtW(b.w)}kg` : ''} ${b.sets}×${esc(b.reps)}</div>`;
    }).join('');
    let action = '';
    if (stat && stat.status === 'offline') action = `<button class="btn tiny ghost" data-unmark="${sid}" data-week="${weekAbs}">取消标记</button>`;
    else if (stat && stat.status !== 'app' && dayDiff(start, today) >= 0) action = `<button class="btn tiny ghost" data-mark="${sid}" data-week="${weekAbs}">标记 App 外完成</button>`;
    return `<div class="preview ${stat ? stat.status : ''}"><div class="row between"><span class="row"><span class="tag">${sessionName(sid, week)}</span>${stat ? BADGE[stat.status] : ''}</span><span class="muted">${WEEKDAYS[weekdayIdx(date)]} ${fmtDate(date)}</span></div>${lines}${action ? `<div class="row" style="justify-content:flex-end">${action}</div>` : ''}</div>`;
  }).join('');
}

function renderChallenge() {
  const today = new Date();
  const pos = position(state, today);
  const cycle = pos ? pos.cycle : 0;
  const today0 = new Date();
  const weeksDone = Array.from({ length: 12 }, (_, w) => cycle * 12 + w).filter((wa) => {
    const wk = (wa % 12) + 1;
    return orderFor(wk).slice(0, requiredFor(wk)).every((sid) => ['app', 'offline'].includes(sessionStatus(state, wa, sid, today0).status));
  }).length;
  const C = 2 * Math.PI * 42;
  let html = `<div class="page-head"><h1>挑战</h1></div>
    <div class="card challenge-hero">
      <div class="ring big r-main"><div class="ring-fig"><svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="42"/>
        <circle class="val" cx="50" cy="50" r="42" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - weeksDone / 12)).toFixed(1)}" transform="rotate(-90 50 50)"/></svg>
        <div class="ring-txt"><b>${weeksDone}</b><small>/12 周</small></div></div></div>
      <div class="grow"><div class="muted">第 ${cycle + 1} 轮</div><h2>3 个月力量挑战</h2>
        <div class="muted">${pos ? `当前第 ${pos.week} 周 · ${esc(WEEKS[pos.week - 1].name)}` : `${fmtDate(parseKey(state.startDate))} 开始`}</div>
        <div class="muted">一周四练 · 5/3/1 · TM = 90% 1RM</div></div></div>
    <div class="card"><h2>训练最大重量 TM（第 ${cycle + 1} 轮）</h2>
    <table class="tm"><tr><th></th><th>1–4周</th><th>5–8周</th><th>9–12周</th></tr>
    ${LIFTS.map((l) => `<tr><td>${variantOf(state, l).name.replace(/（.*）/, '')}</td>${[1, 5, 9].map((w) => `<td>${fmtW(roundTo(tmFor(state, cycle, w, l), 0.5))}</td>`).join('')}</tr>`).join('')}</table>
    <p class="muted">第 5、9 周上肢 +2.5kg，下肢 +5kg。第 12 周测完极限，下一轮按新 1RM × 90% 重新计算。</p>
    <div class="row wrap"><button class="btn small ghost" data-act="edit">修改最大重量 / 设置</button>
      <button class="btn small ghost" data-act="postpone">本周没练完，整体顺延一周</button>
      <button class="btn small ghost" data-act="advance">往前调一周</button></div></div>`;
  for (let w = 0; w < 12; w++) {
    const weekAbs = cycle * 12 + w;
    const start = addDays(parseKey(state.startDate), weekAbs * 7);
    const isCur = pos && pos.weekAbs === weekAbs;
    const sts = orderFor(w + 1).slice(0, requiredFor(w + 1)).map((sid) => sessionStatus(state, weekAbs, sid, today).status);
    const nApp = sts.filter((x) => x === 'app').length, nOff = sts.filter((x) => x === 'offline').length;
    const past = pos && weekAbs <= pos.weekAbs;
    const summary = !past ? '' : nApp + nOff >= sts.length ? `<span class="badge ${nApp ? 'app' : 'offline'}">${nOff && !nApp ? '📝' : '✓'} 已完成</span>`
      : `<span class="badge${isCur ? '' : ' missed'}">${nApp + nOff}/${sts.length}</span>`;
    html += `<details class="card week"${isCur ? ' open' : ''}><summary><b>第 ${w + 1} 周</b> ${esc(WEEKS[w].name)} ${summary}
      <span class="muted">${fmtDate(start)}起${isCur ? ' · 本周' : ''}</span></summary>${weekPreviewHtml(state, weekAbs, false, true)}</details>`;
  }
  $('#view-challenge').innerHTML = html;
}
function bindChallenge() {
  $('#view-challenge').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && (b.dataset.mark || b.dataset.unmark)) {
      const w = Number(b.dataset.week);
      if (b.dataset.mark) { if (!markOffline(state, w, b.dataset.mark, new Date())) return toast('这一周没有空的日期可以标记'); }
      else unmarkOffline(state, w, b.dataset.unmark);
      save(); render(); return;
    }
    const a = b?.dataset.act;
    if (a === 'edit') startWizard(true);
    else if (a === 'postpone' && confirm('把整个计划往后推一周？（本周重新按当前这一周的内容练）')) { state.startDate = dateKey(addDays(parseKey(state.startDate), 7)); save(); render(); toast('已顺延一周'); }
    else if (a === 'advance' && confirm('把计划往前调一周？（相当于跳到下一周）')) { state.startDate = dateKey(addDays(parseKey(state.startDate), -7)); save(); render(); }
  });
}
