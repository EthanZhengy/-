'use strict';
/* 训练 button menu (训记-style): 新建训练 (free workout), 训练模板 (pick any session of the current plan week),
 * 新建有氧, 新建休息, 身体数据. A free workout lives in log.free; its exercises reuse the editable-set
 * blocks of the workout screen under the session id 'free'. */

const FIC = {
  free: svgI('<circle cx="12" cy="5" r="2.3"/><path d="M12 8v5.5M8.5 21l3.5-7.5 3.5 7.5M3 10.5h18M3 8v5M21 8v5"/>', false),
  tpl: svgI('<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>', false),
  cardio: svgI('<circle cx="14.5" cy="4.5" r="2"/><path d="M8 21l3-6 3 2.5V22M6.5 11l3-3.5h4.5l2.5 4 3 .5M10 13.5 7.5 12"/>', false),
  rest: svgI('<path d="M5 10h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c-.8 1 .8 2-.1 3.2M12 3.5c-.8 1 .8 2-.1 3.2"/>', false),
  body: svgI('<circle cx="12" cy="4.5" r="2.3"/><path d="M6 9h12M12 9v12M9 21l3-7 3 7"/>', false),
  play: svgI('<path d="M8 5.5v13l10.5-6.5z"/>'),
  pause: svgI('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>'),
  min: svgI('<path d="M4 20l6-6M10 18.5V14H5.5M20 4l-6 6M14 5.5V10h4.5"/>', false),
  note: svgI('<path d="M6 3.5h9l3 3V20.5H6z"/><path d="M9 10h6M9 13.5h6M9 17h3"/>', false),
  trash: svgI('<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>', false),
};
const FAB_ITEMS = [['free', '新建训练', '#6f8ff7'], ['tpl', '训练模板', '#f29d4b'], ['cardio', '新建有氧', '#4fcfbe'], ['rest', '新建休息', '#7b6cf0'], ['body', '身体数据', '#ef7a7a']];
const CARDIO = [['run', '跑步', 9.8], ['walk', '快走', 4.3], ['bike', '单车', 7.5], ['ellip', '椭圆机', 5], ['rower', '划船机', 7], ['stair', '爬楼机', 9], ['rope', '跳绳', 11], ['swim', '游泳', 8]];
let cardioKind = 'run';

/* ---------- free workout state ---------- */
function freeLog(log) {
  log.free = log.free || { title: '', note: '', elapsed: 0, startedAt: null, done: false };
  return log.free;
}
const freeElapsed = (f) => (f ? f.elapsed + (f.startedAt ? Date.now() - f.startedAt : 0) : 0);
function fmtClock(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const mmss = `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return h ? `${h}:${mmss}` : mmss;
}
function startFree() {
  freeLog(todayInfo().log);
  wkMode = 'free';
}
function freeStatsText(t) {
  const r = freeSummary(state, t.date, t.log);
  return `${r.done}/${r.sets} 组 · 容量 ${r.volume}kg`;
}
function updateFreeStats() { const el = $('#fstats'); if (el) el.textContent = freeStatsText(todayInfo()); }
// Tick the clocks on the free-workout screen and the home banner
setInterval(() => {
  const f = state.logs[dateKey(new Date())] && state.logs[dateKey(new Date())].free;
  if (!f || !f.startedAt) return;
  document.querySelectorAll('[data-fclock]').forEach((el) => { el.textContent = fmtClock(freeElapsed(f)); });
}, 1000);

function renderFree() {
  const t = todayInfo();
  const f = freeLog(t.log);
  const s = sessionWithExtras(state, t.date, 'free', t.log);
  $('#view-workout').innerHTML = `<div class="free-head">
      <div class="row between"><div class="row"><b class="fclock" data-fclock>${fmtClock(freeElapsed(f))}</b>
        ${f.done ? '' : `<button class="icon-round" data-fact="timer" aria-label="${f.startedAt ? '暂停' : '开始'}计时">${f.startedAt ? FIC.pause : FIC.play}</button>`}</div>
        ${f.done ? '<button class="btn ghost" data-fact="resume">继续训练</button>' : '<button class="btn" data-fact="finish">完成</button>'}</div>
      <div class="row between"><button class="ftitle" data-fact="title">✎ ${f.title ? esc(f.title) : '<span class="muted">点击输入训练标题</span>'}</button>
        <span class="muted small" id="fstats">${freeStatsText(t)}</span></div></div>
    <div class="free-body">
      ${f.done ? `<div class="card center">${BADGE.app}<p>训练已完成 · 用时 ${fmtClock(freeElapsed(f))}</p></div>` : ''}
      ${s.blocks.length ? s.blocks.map((b) => blockHtml(s, b, t.log, 'free')).join('')
        : `<div class="free-empty"><p>还没有动作</p><p class="muted">点下方「加动作」从动作库选择，或用「训练模板」练今天计划里的主项。</p>
            <button class="btn" data-act="add-extra">＋ 加动作</button> <button class="btn ghost" data-fact="tpl">训练模板</button></div>`}
      ${f.note ? `<div class="card"><h3>训练心得</h3><p class="pre">${esc(f.note)}</p></div>` : ''}
    </div>
    <nav class="free-bar">
      <button data-fact="min">${FIC.min}<span>最小化</span></button>
      <button data-fact="tpl">${FIC.tpl}<span>模板</span></button>
      <button class="add" data-act="add-extra"><i>${ICONS.plus}</i><span>加动作</span></button>
      <button data-fact="note">${FIC.note}<span>写心得</span></button>
      <button data-fact="discard">${FIC.trash}<span>放弃</span></button>
    </nav>`;
}

function freeAction(act, t) {
  const f = freeLog(t.log);
  if (act === 'timer') {
    if (f.startedAt) { f.elapsed += Date.now() - f.startedAt; f.startedAt = null; } else f.startedAt = Date.now();
  } else if (act === 'finish') {
    const r = freeSummary(state, t.date, t.log);
    if (!r.done && !confirm('还没有完成任何一组，确定结束这次训练吗？')) return;
    if (f.startedAt) { f.elapsed += Date.now() - f.startedAt; f.startedAt = null; }
    f.done = true;
    f.result = { ...r, minutes: Math.round(f.elapsed / 60000), title: f.title || '自由训练' };
    stopRest();
    toast('💪 训练完成！');
  } else if (act === 'resume') { f.done = false; delete f.result; }
  else if (act === 'title') {
    return openSheet('训练标题', `<input id="ftInput" maxlength="30" placeholder="如：胸 + 三头" value="${esc(f.title)}">
      <div class="chips">${['胸', '背', '腿', '肩', '手臂', '推', '拉', '全身'].map((x) => `<button class="chip" data-ftq="${x}">${x}</button>`).join('')}</div>
      <button class="btn block" data-fsave="title">保存</button>`, { type: 'ftitle' });
  } else if (act === 'note') {
    return openSheet('写心得', `<textarea id="fnInput" rows="6" placeholder="今天的状态、感受、需要改进的地方…">${esc(f.note)}</textarea>
      <button class="btn block" data-fsave="note">保存</button>`, { type: 'fnote' });
  } else if (act === 'min') { currentView = 'home'; homeTab = 'today'; render(); return; }
  else if (act === 'tpl') return openTemplates();
  else if (act === 'discard') {
    if (!confirm('放弃这次自由训练？已记录的组会被清除。')) return;
    delete t.log.free;
    delete t.log.extra.free;
    Object.keys(t.log.sx).concat(Object.keys(t.log.sets)).filter((k) => k.startsWith('free:')).forEach((k) => { delete t.log.sx[k]; delete t.log.sets[k]; });
    stopRest();
    wkMode = 'plan'; currentView = 'home';
  } else return;
  save(); render();
}

/* ---------- 训练 button menu ---------- */
function openFabMenu() {
  const t = todayInfo();
  const f = t.log.free;
  const planBusy = t.pos && t.sid !== 'rest' && !t.log.done && Object.keys(t.log.sets).some((k) => k.startsWith(`${t.sid}:`) && t.log.sets[k].some(Boolean));
  const resume = f && !f.done ? `<button class="fab-resume" data-fm="resume-free">继续：${esc(f.title || '自由训练')} <b data-fclock>${fmtClock(freeElapsed(f))}</b></button>`
    : planBusy ? `<button class="fab-resume" data-fm="resume-plan">继续：${sessionName(t.sid, t.pos.week)}</button>` : '';
  sheetCtx = { type: 'fab' };
  $('#sheet').innerHTML = `<div class="fab-menu" data-fab-bg>
    ${resume}
    <div class="fab-grid">${FAB_ITEMS.map(([k, l, c]) => `<button data-fm="${k}"><span class="fm-ic" style="background:${c}">${FIC[k]}</span><span>${l}</span></button>`).join('')}</div>
    <button class="fab-x" data-sheet-close aria-label="关闭">${ICONS.close}</button></div>`;
  $('#sheet').hidden = false;
  document.body.classList.add('sheet-open');
}

function openTemplates() {
  const t = todayInfo();
  if (!t.pos) {
    return openSheet('训练模板', `<p>${esc(progOf().name)} 将于 ${fmtDate(parseKey(state.startDate))} 开始。</p>
      <button class="btn block" data-tplact="switch">切换训练计划</button>`, { type: 'tpl', reopen: openTemplates });
  }
  const { pos } = t;
  const order = orderFor(pos.week);
  const status = (sid) => sessionStatus(state, pos.weekAbs, sid, t.date).status;
  const doneN = order.filter((sid) => ['app', 'offline'].includes(status(sid))).length;
  const rows = order.map((sid) => {
    const sess = buildSession(state, t.date, sid, {});
    const main = sess.blocks.find((b) => b.type === 'main');
    const top = main && main.rows.filter((r) => !r.extra).slice(-1)[0];
    const preview = top ? `主项最重 ${fmtW(top.w)}kg × ${top.reps}${top.plus ? '+' : ''}` : sess.blocks[0] ? `${sess.blocks[0].w ? `${fmtW(sess.blocks[0].w)}kg × ` : ''}${sess.blocks[0].reps || ''}` : '';
    const st = status(sid);
    return `<button class="tpl-row${t.sid === sid ? ' on' : ''}" data-tpl="${sid}">
      <div class="grow"><b>${sessionName(sid, pos.week)}${sid === t.rec.session ? ' ⭐' : ''}</b>
        <div class="muted small">${sess.blocks.map((b) => esc(b.title.replace(/^.*· /, ''))).slice(0, 5).join(' · ')}</div>
        <div class="small">${esc(preview)}</div></div>
      <span class="tpl-st ${st}">${st === 'app' ? '✓ 已完成' : st === 'offline' ? '📝 App 外' : '未练'}</span></button>`;
  }).join('');
  openSheet('训练模板', `<div class="tpl-head"><b>${esc(progOf().name)}</b><div class="muted">第 ${pos.cycle + 1} 轮 · 第 ${pos.week} 周 ${esc(weekName(pos.week))} · 本周已练 ${doneN}/${requiredFor(pos.week)}</div></div>
    <p class="muted small">本周的训练不用按顺序，根据今天的状态自由选一个，这周练完就行。⭐ 是推荐。</p>
    ${rows}
    <button class="btn ghost block" data-tplact="switch">切换训练计划</button>`, { type: 'tpl', reopen: openTemplates });
}

function openCardio() {
  const t = todayInfo();
  const list = t.log.cardio || [];
  openSheet('新建有氧', `<div class="chips">${CARDIO.map(([k, l]) => `<button class="chip${cardioKind === k ? ' on' : ''}" data-ck="${k}">${l}</button>`).join('')}</div>
    <div class="grid2"><div><label>时长（分钟）</label><input id="cMin" type="number" inputmode="numeric" min="1" placeholder="30"></div>
      <div><label>距离（公里，可不填）</label><input id="cKm" type="number" inputmode="decimal" step="0.1" placeholder="5"></div></div>
    <button class="btn block" data-cact="save">保存</button>
    ${list.length ? `<h3>今天的有氧</h3>${list.map((c, i) => `<div class="kv"><span>${esc(cardioName(c.kind))} ${c.min} 分钟${c.km ? ` · ${c.km} 公里` : ''}</span><b>${c.kcal} 千卡 <button class="link" data-cdel="${i}">删除</button></b></div>`).join('')}` : ''}
    <p class="muted">消耗按 MET × 体重 × 时长估算。</p>`, { type: 'cardio', reopen: openCardio });
}
const cardioName = (k) => (CARDIO.find((c) => c[0] === k) || [k, k])[1];

/* ---------- home & history pieces ---------- */
function homeFreeHtml(t) {
  let html = '';
  const f = t.log.free;
  if (f && !f.done) {
    const r = freeSummary(state, t.date, t.log);
    html += `<button class="card free-banner" data-fm-open="free"><div class="grow"><b>${esc(f.title || '自由训练')}</b> 进行中
      <div class="muted small">${r.exercises} 个动作 · ${r.done}/${r.sets} 组</div></div><b class="fclock" data-fclock>${fmtClock(freeElapsed(f))}</b><span class="muted">继续 ›</span></button>`;
  } else if (f && f.done && f.result) {
    html += `<button class="card free-banner done" data-fm-open="free"><div class="grow"><b>✓ ${esc(f.result.title)}</b>
      <div class="muted small">${f.result.exercises} 个动作 · ${f.result.done} 组 · 容量 ${f.result.volume}kg · ${f.result.minutes} 分钟</div></div><span class="muted">查看 ›</span></button>`;
  }
  const c = t.log.cardio || [];
  if (c.length) {
    html += `<div class="card"><div class="row between"><h2>今天的有氧</h2><button class="btn tiny ghost" data-fm-open="cardio">＋ 记录</button></div>
      ${c.map((x) => `<div class="kv"><span>${esc(cardioName(x.kind))} ${x.min} 分钟${x.km ? ` · ${x.km} 公里` : ''}</span><b>${x.kcal} 千卡</b></div>`).join('')}</div>`;
  }
  return html;
}

function freeHistoryHtml() {
  const rows = Object.keys(state.logs).sort().reverse().filter((k) => {
    const l = state.logs[k];
    return (l.free && l.free.done && l.free.result) || (l.cardio && l.cardio.length);
  }).slice(0, 30).map((k) => {
    const l = state.logs[k];
    const d = parseKey(k);
    const date = `<span class="muted">${fmtDate(d)} ${WEEKDAYS[weekdayIdx(d)]}</span>`;
    let h = '';
    if (l.free && l.free.done && l.free.result) {
      const r = l.free.result;
      h += `<div class="hist"><div class="row between"><span><b>${esc(r.title)}</b> ${date}</span>${BADGE.app}</div>
        <div class="muted">${esc(r.names.slice(0, 4).join('、'))}${r.names.length > 4 ? ' 等' : ''} · ${r.done} 组 · ${(r.volume / 1000).toFixed(2)} 吨 · ${r.minutes} 分钟</div></div>`;
    }
    (l.cardio || []).forEach((c) => {
      h += `<div class="hist"><div class="row between"><span><b>${esc(cardioName(c.kind))}</b> ${date}</span><span class="muted">${c.kcal} 千卡</span></div>
        <div class="muted">${c.min} 分钟${c.km ? ` · ${c.km} 公里` : ''}</div></div>`;
    });
    return h;
  }).join('');
  return rows ? `<div class="card"><h2>自由训练与有氧</h2>${rows}</div>` : '';
}

function bindFree() {
  $('#sheet').addEventListener('click', (e) => {
    if (!sheetCtx) return;
    const b = e.target.closest('button');
    const t = todayInfo();
    if (sheetCtx.type === 'fab') {
      if (!b) { if (e.target.closest('[data-fab-bg]')) closeSheet(); return; }
      const k = b.dataset.fm;
      if (!k) return;
      closeSheet();
      if (k === 'free' || k === 'resume-free') { startFree(); currentView = 'workout'; render(); window.scrollTo(0, 0); }
      else if (k === 'resume-plan') { wkMode = 'plan'; currentView = 'workout'; render(); window.scrollTo(0, 0); }
      else if (k === 'tpl') openTemplates();
      else if (k === 'cardio') openCardio();
      else if (k === 'body') openWeightSheet();
      else if (k === 'rest') {
        if (t.log.done) return toast('今天已经完成训练了');
        t.log.session = 'rest'; save();
        wkMode = 'plan'; currentView = 'home'; homeTab = 'today'; render();
        toast('今天设为休息日 🧘');
      }
      return;
    }
    if (!b) return;
    const ds = b.dataset;
    if (sheetCtx.type === 'tpl') {
      if (ds.tplact === 'switch') { closeSheet(); currentView = 'challenge'; render(); return openProgramPicker(); }
      if (!ds.tpl) return;
      if (t.log.done && t.log.session !== ds.tpl) return toast(`今天已完成${sessionName(t.log.session, t.pos.week)}，先在训练页撤销完成再换`);
      t.log.session = ds.tpl;
      wkMode = 'plan'; save(); closeSheet();
      currentView = 'workout'; render(); window.scrollTo(0, 0);
    } else if (sheetCtx.type === 'cardio') {
      if (ds.ck) { cardioKind = ds.ck; return refreshSheet(); }
      if (ds.cdel) { t.log.cardio.splice(Number(ds.cdel), 1); save(); render(); return refreshSheet(); }
      if (ds.cact !== 'save') return;
      const min = Number($('#cMin').value), km = Number($('#cKm').value) || 0;
      if (!(min > 0 && min < 600)) return toast('请输入时长');
      const met = CARDIO.find((c) => c[0] === cardioKind)[2];
      (t.log.cardio = t.log.cardio || []).push({ kind: cardioKind, min, km, kcal: Math.round(met * (state.profile.weight || 70) * min / 60) });
      save(); render(); refreshSheet(); toast(`已记录：${cardioName(cardioKind)} ${min} 分钟`);
    } else if (sheetCtx.type === 'ftitle' || sheetCtx.type === 'fnote') {
      const f = freeLog(t.log);
      if (ds.ftq) { const inp = $('#ftInput'); inp.value = inp.value ? `${inp.value} + ${ds.ftq}` : ds.ftq; return; }
      if (ds.fsave === 'title') f.title = $('#ftInput').value.trim();
      else if (ds.fsave === 'note') f.note = $('#fnInput').value.trim();
      else return;
      if (f.result) f.result.title = f.title || '自由训练';
      save(); closeSheet(); render();
    }
  });
  // home banner / cardio card shortcuts
  $('#view-home').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fm-open]');
    if (!b) return;
    if (b.dataset.fmOpen === 'cardio') return openCardio();
    startFree(); currentView = 'workout'; render(); window.scrollTo(0, 0);
  });
}
