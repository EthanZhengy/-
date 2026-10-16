'use strict';
/* ================= 挑战: the active training program, week by week ================= */

const BADGE = {
  app: '<span class="badge app">✓ App 完成</span>',
  offline: '<span class="badge offline">📝 App 外完成</span>',
  missed: '<span class="badge missed">未完成</span>',
  upcoming: '',
};

/** "60×5 · 60×5 · 60×5" → "60×5 ×3组" */
function compactRows(rows) {
  const parts = [];
  rows.forEach((r) => {
    const t = `${fmtW(r.w)}×${r.reps}${r.plus ? '+' : ''}`;
    const last = parts[parts.length - 1];
    if (last && last.t === t) last.n++; else parts.push({ t, n: 1 });
  });
  return parts.map((p) => (p.n > 1 ? `${p.t} ×${p.n}组` : p.t)).join(' · ');
}

function weekPreviewHtml(st, weekAbs, compact, withStatus) {
  const week = (weekAbs % progOf(st).weeks) + 1;
  const start = addDays(parseKey(st.startDate), weekAbs * 7);
  const today = new Date();
  return orderFor(week, st).map((sid, i) => {
    const stat = withStatus ? sessionStatus(st, weekAbs, sid, today) : null;
    const date = stat ? stat.date : addDays(start, st.schedule[i] ?? i);
    const s = buildSession(st, date, sid, {});
    if (!s) return '';
    const lines = s.blocks.map((b) => {
      if (b.type === 'main') return `<div><b>${esc(b.title.replace(/^主项 · /, ''))}</b> ${compactRows(b.rows.filter((r) => !r.label || !r.label.startsWith('热身')))}</div>`;
      if (compact) return '';
      return `<div class="muted">${esc(b.title)}${b.w ? ` ${fmtW(b.w)}kg` : ''} ${b.sets}×${esc(b.reps)}</div>`;
    }).join('');
    let action = '';
    if (stat && stat.status === 'offline') action = `<button class="btn tiny ghost" data-unmark="${sid}" data-week="${weekAbs}">取消标记</button>`;
    else if (stat && stat.status !== 'app' && dayDiff(start, today) >= 0) action = `<button class="btn tiny ghost" data-mark="${sid}" data-week="${weekAbs}">标记 App 外完成</button>`;
    return `<div class="preview ${stat ? stat.status : ''}"><div class="row between"><span class="row"><span class="tag">${sessionName(sid, week)}</span>${stat ? BADGE[stat.status] : ''}</span><span class="muted">${WEEKDAYS[weekdayIdx(date)]} ${fmtDate(date)}</span></div>${lines}${action ? `<div class="row" style="justify-content:flex-end">${action}</div>` : ''}</div>`;
  }).join('');
}

function programCardHtml(cycle) {
  if (isMike()) {
    const m = state.mike;
    const v = MIKE_VARIANTS[m.variant] || MIKE_VARIANTS.pause;
    return `<div class="card"><h2>卧推 1RM（第 ${cycle + 1} 轮）</h2>
      <div class="kv"><span>杠铃卧推 1RM</span><b>${fmtW(roundTo(mikeMax(state, cycle, 'bench'), 0.5))}kg</b></div>
      <div class="kv"><span>窄推 1RM</span><b>${fmtW(roundTo(mikeMax(state, cycle, 'cg'), 0.5))}kg</b></div>
      <div class="kv"><span>五选一辅助卧推（第 5 周起）</span><b>${esc(v.name)}</b></div>
      <p class="muted">所有重量都按 1RM 的百分比计算。第 16 周测出新极限后，下一轮自动按新 1RM 重新计算。</p>
      <div class="row wrap"><button class="btn small ghost" data-act="edit-lifts">修改 1RM / 辅助卧推</button>
        <button class="btn small ghost" data-act="postpone">本周没练完，整体顺延一周</button>
        <button class="btn small ghost" data-act="advance">往前调一周</button></div></div>`;
  }
  return `<div class="card"><h2>训练最大重量 TM（第 ${cycle + 1} 轮）</h2>
    <table class="tm"><tr><th></th><th>1–4周</th><th>5–8周</th><th>9–12周</th></tr>
    ${LIFTS.map((l) => `<tr><td>${variantOf(state, l).name.replace(/（.*）/, '')}</td>${[1, 5, 9].map((w) => `<td>${fmtW(roundTo(tmFor(state, cycle, w, l), 0.5))}</td>`).join('')}</tr>`).join('')}</table>
    <p class="muted">第 5、9 周上肢 +2.5kg，下肢 +5kg。第 12 周测完极限，下一轮按新 1RM × 90% 重新计算。</p>
    <div class="row wrap"><button class="btn small ghost" data-act="edit-lifts">修改最大重量 / 设置</button>
      <button class="btn small ghost" data-act="postpone">本周没练完，整体顺延一周</button>
      <button class="btn small ghost" data-act="advance">往前调一周</button></div></div>`;
}

function renderChallenge() {
  const today = new Date();
  const P = progOf();
  const pos = position(state, today);
  const cycle = pos ? pos.cycle : 0;
  const weeksDone = Array.from({ length: P.weeks }, (_, w) => cycle * P.weeks + w).filter((wa) => {
    const wk = (wa % P.weeks) + 1;
    return orderFor(wk).slice(0, requiredFor(wk)).every((sid) => ['app', 'offline'].includes(sessionStatus(state, wa, sid, today).status));
  }).length;
  const C = 2 * Math.PI * 42;
  let html = `<div class="page-head"><h1>挑战</h1><button class="pill-btn big" data-act="switch-program">切换计划</button></div>
    <button class="card mk-entry" data-act="market"><span class="mk-entry-ic">🏆</span><span class="grow"><b>大神方案</b><span class="muted small">看看别人怎么练，一键加入自己的训练模板</span></span><span class="muted">›</span></button>
    <div class="card challenge-hero">
      <div class="ring big r-main"><div class="ring-fig"><svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="42"/>
        <circle class="val" cx="50" cy="50" r="42" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - weeksDone / P.weeks)).toFixed(1)}" transform="rotate(-90 50 50)"/></svg>
        <div class="ring-txt"><b>${weeksDone}</b><small>/${P.weeks} 周</small></div></div></div>
      <div class="grow"><div class="muted">第 ${cycle + 1} 轮</div><h2>${esc(P.name)}</h2>
        <div class="muted">${pos ? `当前第 ${pos.week} 周 · ${esc(weekName(pos.week))}` : `${fmtDate(parseKey(state.startDate))} 开始`}</div>
        <div class="muted">${isMike() ? '一周两推 · 按 1RM 百分比' : '一周四练 · 5/3/1 · TM = 90% 1RM'}</div></div></div>
    ${programCardHtml(cycle)}`;
  for (let w = 0; w < P.weeks; w++) {
    const weekAbs = cycle * P.weeks + w;
    const start = addDays(parseKey(state.startDate), weekAbs * 7);
    const isCur = pos && pos.weekAbs === weekAbs;
    const sts = orderFor(w + 1).slice(0, requiredFor(w + 1)).map((sid) => sessionStatus(state, weekAbs, sid, today).status);
    const nApp = sts.filter((x) => x === 'app').length, nOff = sts.filter((x) => x === 'offline').length;
    const past = pos && weekAbs <= pos.weekAbs;
    const summary = !past ? '' : nApp + nOff >= sts.length ? `<span class="badge ${nApp ? 'app' : 'offline'}">${nOff && !nApp ? '📝' : '✓'} 已完成</span>`
      : `<span class="badge${isCur ? '' : ' missed'}">${nApp + nOff}/${sts.length}</span>`;
    html += `<details class="card week"${isCur ? ' open' : ''}><summary><b>第 ${w + 1} 周</b> ${esc(weekName(w + 1))} ${summary}
      <span class="muted">${fmtDate(start)}起${isCur ? ' · 本周' : ''}</span></summary>${weekPreviewHtml(state, weekAbs, false, true)}</details>`;
  }
  $('#view-challenge').innerHTML = html;
}

/** Pick another training program; setting it up goes through the questionnaire's plan steps. */
function openProgramPicker() {
  openSheet('选择训练计划', `${Object.values(PROGRAMS).map((p) => {
    const on = progOf().id === p.id;
    const saved = state.programs && state.programs[p.id];
    return `<button class="prog-card${on ? ' on' : ''}" data-program="${p.id}">
      <div class="row between"><b>${esc(p.name)}</b>${on ? '<span class="tag">当前</span>' : saved ? '<span class="tag">有进度</span>' : ''}</div>
      <div class="muted">${p.weeks} 周 · 一周 ${p.days} 练</div><p>${esc(p.desc)}</p></button>`;
  }).join('')}
    <p class="muted">切换后，之前计划的训练记录都会保留在「历史」里；切回来时可以接着之前的进度练。</p>`, { type: 'program' });
}

function bindChallenge() {
  $('#sheet').addEventListener('click', (e) => {
    const b = e.target.closest('[data-program]');
    if (!b || !sheetCtx || sheetCtx.type !== 'program') return;
    closeSheet();
    if (b.dataset.program === progOf().id) return;
    startWizard(true, b.dataset.program, 'program');
  });
  $('#view-challenge').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && (b.dataset.mark || b.dataset.unmark)) {
      const w = Number(b.dataset.week);
      if (b.dataset.mark) { if (!markOffline(state, w, b.dataset.mark, new Date())) return toast('这一周没有空的日期可以标记'); }
      else unmarkOffline(state, w, b.dataset.unmark);
      save(); render(); return;
    }
    const a = b?.dataset.act;
    if (a === 'edit-lifts') startWizard(true, null, 'lifts');
    else if (a === 'switch-program') openProgramPicker();
    else if (a === 'market') openMarket();
    else if (a === 'postpone' && confirm('把整个计划往后推一周？（本周重新按当前这一周的内容练）')) { state.startDate = dateKey(addDays(parseKey(state.startDate), 7)); save(); render(); toast('已顺延一周'); }
    else if (a === 'advance' && confirm('把计划往前调一周？（相当于跳到下一周）')) { state.startDate = dateKey(addDays(parseKey(state.startDate), -7)); save(); render(); }
  });
}
