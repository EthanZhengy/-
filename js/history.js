'use strict';
/* ================= 历史: records & analytics ================= */

let statsLift = 'squat';
let histTab = 'log';
let calMonth = 0; // months back from this one
let calDay = null; // selected date key

/* ---------- 月历: each day lists what was trained, in short (推肩 · 推胸 · 有氧) ---------- */
const SESSION_SHORT = { press: '推肩', bench: '推胸', squat: '深蹲', deadlift: '硬拉', mike1: '推胸', mike2: '推臂', mikeTest: '测试' };
const CAT_SHORT = { chest: '胸', back: '背', leg: '腿', glute: '臀', calf: '腿', shoulder: '肩', bi: '臂', tri: '臂', core: '腹', grip: '握力' };
/** 自由训练: its title if the user named it, else the muscles of its exercises (most sets first). */
function freeShort(r) {
  if (r.title && r.title !== '自由训练') return r.title.slice(0, 4);
  const n = {};
  // r.cats is saved since 1.22; older records fall back to looking the names up
  const cats = r.cats || (r.names || []).map((name) => {
    const lift = LIFTS.find((l) => VARIANTS[l].some((v) => v.name === name));
    if (lift) return LIFT_CAT[lift];
    const e = allExercises(state).find((x) => x.name === name) || (typeof EXDB !== 'undefined' && EXDB.find((x) => x.name === name));
    return e ? exCat(e) : '';
  });
  cats.forEach((cat) => { const c = CAT_SHORT[cat]; if (c) n[c] = (n[c] || 0) + 1; });
  const top = Object.keys(n).sort((a, b) => n[b] - n[a]).slice(0, 2);
  return top.length ? top.join('') : '训练';
}
function dayTags(l) {
  if (!l) return [];
  const tags = [];
  if (l.done && SESSIONS[l.session]) tags.push({ t: SESSION_SHORT[l.session] || sessionName(l.session, 1).slice(0, 2), cls: l.offline ? 'off' : '' });
  else if (l.done && l.result && l.result.custom) tags.push({ t: (l.result.title || '训练').slice(0, 4), cls: '' });
  if (l.free && l.free.done && l.free.result) tags.push({ t: freeShort(l.free.result), cls: '' });
  if (l.cardio && l.cardio.length) tags.push({ t: '有氧', cls: 'cardio' });
  return tags;
}
function monthCalHtml() {
  const now = new Date();
  const m0 = new Date(now.getFullYear(), now.getMonth() - calMonth, 1);
  const days = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate();
  const lead = weekdayIdx(m0);
  let n = 0;
  let cells = '<span class="mc-pad"></span>'.repeat(lead);
  for (let d = 1; d <= days; d++) {
    const date = new Date(m0.getFullYear(), m0.getMonth(), d);
    const key = dateKey(date);
    const tags = dayTags(state.logs[key]);
    if (tags.length) n++;
    const cls = [tags.length ? 'has' : '', key === dateKey(now) ? 'today' : '', key === calDay ? 'sel' : '', date > now ? 'future' : ''].filter(Boolean).join(' ');
    cells += `<button class="mc-day ${cls}" data-calday="${key}"><b>${d}</b>${tags.slice(0, 2).map((x) => `<i class="${x.cls}">${esc(x.t)}</i>`).join('')}${tags.length > 2 ? '<i class="more">…</i>' : ''}</button>`;
  }
  return `<div class="card"><div class="row between"><button class="icon-round sm" data-calnav="1" aria-label="上个月">‹</button>
      <h2 class="mc-title">${m0.getFullYear()}年${m0.getMonth() + 1}月 <span class="muted">· 练了 ${n} 天</span></h2>
      <button class="icon-round sm" data-calnav="-1" aria-label="下个月" ${calMonth ? '' : 'disabled'}>›</button></div>
    <div class="mc-grid">${WEEKDAYS.map((w) => `<span class="mc-wd">${w.replace('周', '')}</span>`).join('')}${cells}</div>
    ${calDay ? dayDetailHtml(calDay) : '<p class="muted small center">点某一天查看当天练了什么</p>'}</div>`;
}
function dayDetailHtml(key) {
  const l = state.logs[key];
  const d = parseKey(key);
  const rows = [];
  if (l && l.done && SESSIONS[l.session]) {
    const pos = position(state, d);
    rows.push(`<b>${sessionName(l.session, pos ? pos.week : 1)}</b> ${l.offline ? BADGE.offline : BADGE.app}`);
  }
  if (l && l.done && l.result && l.result.custom) rows.push(`<b>${esc(l.result.title)}</b> <span class="muted">${esc((l.result.names || []).join('、'))}</span>`);
  if (l && l.free && l.free.done && l.free.result) { const r = l.free.result; rows.push(`<b>${esc(r.title)}</b> <span class="muted">${esc(r.names.join('、'))} · ${r.done} 组 · ${r.minutes} 分钟</span>`); }
  (l && l.cardio || []).forEach((c) => rows.push(`<b>${esc(cardioName(c.kind))}</b> <span class="muted">${c.min} 分钟${c.km ? ` · ${c.km} 公里` : ''} · ${c.kcal} 千卡</span>`));
  return `<div class="mc-detail"><h3>${fmtDate(d)} ${WEEKDAYS[weekdayIdx(d)]}</h3>${rows.length ? rows.map((r) => `<div class="mc-row">${r}</div>`).join('') : '<p class="muted">这天没有训练记录</p>'}</div>`;
}

const histTabsHtml = () => `<div class="utabs">${[['log', '训练记录'], ['data', '数据分析'], ['photos', '照片墙']].map(([k, l]) => `<button data-xtab="${k}" class="${histTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;

function renderHistory() {
  const today = new Date();
  const hist = trainingHistory(state);
  const weeks = weekly(state, today, hist);
  const pos = position(state, today);
  if (!pos || !hist.length && !weeks.some((w) => w.app + w.offline)) {
    if (histTab === 'photos') { $('#view-history').innerHTML = `<div class="page-head"><h1>历史</h1></div>${histTabsHtml()}${photoWallHtml()}`; return; }
    $('#view-history').innerHTML = `<div class="page-head"><h1>历史</h1></div>${histTabsHtml()}<div class="card"><h2>还没有训练数据</h2>
      <p class="muted">完成第一次训练后，这里会显示力量曲线、训练量、完成日历和个人纪录。</p>
      <p class="muted">如果之前已经在 App 外练过几周，可以在「挑战」里把那些训练标记为 📝 App 外完成。</p></div>${monthCalHtml()}${freeHistoryHtml()}${bodyweightCard(today)}`;
    return;
  }
  const nApp = hist.filter((h) => !h.offline).length, nOff = hist.length - nApp;
  const totalVol = hist.reduce((a, h) => a + h.volume, 0);
  const passed = weeks.filter((w) => w.cycle === pos.cycle);
  const req = passed.reduce((a, w) => a + (w.current ? Math.max(w.app + w.offline, 0) : w.required), 0);
  const got = passed.reduce((a, w) => a + Math.min(w.required, w.app + w.offline), 0);
  const rate = req ? Math.round((got / req) * 100) : 0;

  let html = `<div class="tiles">
    <div class="tile"><b>${hist.length}</b><span>累计训练</span><small>App ${nApp} · App 外 ${nOff}</small></div>
    <div class="tile"><b>${streak(weeks)}<i>周</i></b><span>连续完成</span><small>每周练满才算</small></div>
    <div class="tile"><b>${rate}<i>%</i></b><span>本轮完成率</span><small>第 ${pos.cycle + 1} 轮</small></div>
    <div class="tile"><b>${(totalVol / 1000).toFixed(1)}<i>吨</i></b><span>总训练量</span><small>主项 + 第二主项</small></div>
  </div>`;

  // Strength curve
  const tm = tmSeries(state, statsLift, today);
  const e1 = e1rmSeries(hist, statsLift);
  const tests = e1.filter((p) => p.src === 'test');
  const amr = e1.filter((p) => p.src === 'amrap');
  const pr = personalRecords(state, hist)[statsLift];
  const series = [
    { name: 'TM', cls: 'ref', step: true, dashed: true, points: tm.map((p) => ({ x: p.date, y: p.tm, tip: `${fmtDate(p.date)} 起 · TM ${fmtW(p.tm)}kg` })) },
    { name: '估算 1RM', cls: 's1', dots: true, points: amr.map((p) => ({ x: p.date, y: p.value, tip: `${fmtDate(p.date)} · ${fmtW(p.w)}kg × ${p.reps} 次 → 估算 1RM ${fmtW(p.value)}kg` })) },
    { name: '测试 1RM', cls: 's1', diamond: true, label: false, points: tests.map((p) => ({ x: p.date, y: p.value, tip: `${fmtDate(p.date)} · 测试 1RM ${fmtW(p.value)}kg` })) },
  ];
  const gain = pr.best ? pr.best.value - pr.start : null;
  html += `<div class="card"><h2>力量曲线</h2>
    <div class="chips">${LIFTS.map((l) => chip(LIFT_NAMES[l], `data-lift="${l}"`, statsLift === l)).join('')}</div>
    <div class="legend"><span><i class="lg ref dashed"></i>${isMike() ? '计划 1RM' : '训练最大重量 TM'}</span><span><i class="lg s1 dot"></i>估算 1RM（"+"组）</span><span><i class="lg s1 diamond"></i>测试 1RM</span></div>
    ${lineChart({ series })}
    <div class="kv"><span>起始 1RM</span><b>${fmtW(pr.start)}kg</b></div>
    <div class="kv"><span>最佳估算 1RM</span><b>${pr.best ? `${fmtW(pr.best.value)}kg` : '—'}${gain !== null ? ` <em class="${gain >= 0 ? 'up' : 'down'}">${gain >= 0 ? '+' : ''}${fmtW(gain)}</em>` : ''}</b></div>
    <div class="kv"><span>App 记录的最大重量</span><b>${pr.heaviest ? `${fmtW(pr.heaviest.w)}kg × ${pr.heaviest.reps}` : '—'}</b></div>
    ${amr.length ? '' : '<p class="muted">在带 "+" 的组里填写实际次数，就能看到估算 1RM 曲线。</p>'}
    ${e1.length ? `<details><summary class="muted">查看数据表</summary><table class="tm">
      <tr><th>日期</th><th>重量×次数</th><th>1RM</th></tr>
      ${e1.slice().reverse().map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${fmtW(p.w)}×${p.reps}${p.src === 'test' ? '（测试）' : ''}</td><td>${fmtW(p.value)}</td></tr>`).join('')}</table></details>` : ''}
  </div>`;

  // Weekly volume
  const recent = weeks.slice(-12);
  const bars = recent.map((w) => ({
    label: `W${w.week}`,
    tip: `第 ${w.cycle + 1} 轮第 ${w.week} 周 · ${w.app + w.offline}/${w.required} 次 · App ${(w.appVolume / 1000).toFixed(1)} 吨 · App 外 ${(w.offlineVolume / 1000).toFixed(1)} 吨`,
    segments: [{ value: w.appVolume / 1000, cls: 's1' }, { value: w.offlineVolume / 1000, cls: 's1soft' }],
  }));
  html += `<div class="card"><h2>每周训练量 <span class="muted">（吨）</span></h2>
    <div class="legend"><span><i class="lg s1"></i>App 记录</span><span><i class="lg s1soft"></i>App 外（按计划估算）</span></div>
    ${barChart({ bars })}
    <p class="muted">减载周（第 4、8 周）训练量下降是正常的。</p></div>`;

  // Calendar
  const firstW = Math.max(0, pos.weekAbs - 11);
  const cells = [], labels = [];
  for (let w = firstW; w <= pos.weekAbs; w++) {
    const start = addDays(parseKey(state.startDate), w * 7);
    labels.push((w - firstW) % 3 === 0 ? `W${(w % progOf().weeks) + 1}` : '');
    cells.push(Array.from({ length: 7 }, (_, d) => {
      const date = addDays(start, d);
      const l = state.logs[dateKey(date)];
      const label = `${fmtDate(date)} ${WEEKDAYS[weekdayIdx(date)]}`;
      if (l && l.done && SESSIONS[l.session]) return { cls: l.offline ? 'off' : 'app', tip: `${label} · ${sessionName(l.session, (w % progOf().weeks) + 1)} · ${l.offline ? 'App 外完成' : 'App 完成'}` };
      if (l && l.done && l.result && l.result.custom) return { cls: 'app', tip: `${label} · ${l.result.title}` };
      if (l && l.free && l.free.done) return { cls: 'app', tip: `${label} · ${l.free.title || '自由训练'}` };
      if (dayDiff(today, date) > 0) return { cls: 'future' };
      return { cls: 'none', tip: `${label} · 无训练` };
    }));
  }
  let logHtml = monthCalHtml() + `<div class="card"><h2>完成热力图</h2>
    <div class="legend"><span><i class="lg s1"></i>App 完成</span><span><i class="lg s1soft"></i>App 外完成</span><span><i class="lg none"></i>未训练</span></div>
    ${calendarChart(cells, labels)}
    <h3>每周完成情况</h3>
    <div class="weekbar">${recent.map((w) => `<span class="${w.app + w.offline >= w.required ? 'full' : w.current ? 'cur' : ''}" data-tip="第 ${w.week} 周 ${w.app + w.offline}/${w.required}">${w.app + w.offline}/${w.required}</span>`).join('')}</div></div>`;

  logHtml += freeHistoryHtml();

  // Recent sessions
  const byWeek = {};
  hist.slice().reverse().forEach((h) => (byWeek[h.pos.weekAbs] = byWeek[h.pos.weekAbs] || []).push(h));
  logHtml += Object.keys(byWeek).sort((a, b) => b - a).map((wa) => {
    const w = weeks[wa];
    return `<div class="card"><div class="row between"><h2>第 ${w.cycle + 1} 轮 · 第 ${w.week} 周</h2><span class="muted">${w.app + w.offline}/${w.required} · ${fmtDate(w.start)}起</span></div>
    ${byWeek[wa].map((h) => `<div class="hist">
      <div class="row between"><span><b>${sessionName(h.session, h.pos.week)}</b> <span class="muted">${fmtDate(h.date)} ${WEEKDAYS[weekdayIdx(h.date)]}</span></span>${BADGE[h.offline ? 'offline' : 'app']}</div>
      <div class="muted">${esc(h.variant)}${h.top ? ` · 最重 ${fmtW(h.top.w)}kg × ${h.top.reps}` : ''}${h.e1rm ? ` · 1RM≈${fmtW(h.e1rm.value)}` : ''} · ${(h.volume / 1000).toFixed(2)} 吨</div></div>`).join('')}</div>`;
  }).join('');

  html += bodyweightCard(today);
  $('#view-history').innerHTML = `<div class="page-head"><h1>历史</h1></div>
    ${histTabsHtml()}
    ${histTab === 'log' ? logHtml : histTab === 'photos' ? photoWallHtml() : html}`;
}

function bodyweightCard(today) {
  const pts = Object.entries(state.bodyweight).sort().map(([k, v]) => ({ x: parseKey(k), y: v, tip: `${fmtDate(parseKey(k))} · ${v}kg` }));
  const first = pts[0], last = pts[pts.length - 1];
  return `<div class="card"><h2>体重</h2>
    <div class="row"><input class="grow" type="number" inputmode="decimal" step="0.1" id="bwInput" placeholder="今天的体重 (kg)" value="${state.bodyweight[dateKey(today)] ?? ''}">
      <button class="btn small" data-act="bw">记录</button></div>
    ${pts.length > 1 ? lineChart({ series: [{ name: '体重', cls: 's1', dots: pts.length < 30, points: pts }], height: 160 }) : '<p class="muted">记录两次以上就能看到体重曲线。增肌期每周增长 0.25–0.5kg 为宜。</p>'}
    ${pts.length > 1 ? `<p class="muted">${fmtDate(first.x)} 至今 ${last.y - first.y >= 0 ? '+' : ''}${(last.y - first.y).toFixed(1)}kg</p>` : ''}</div>`;
}

function bindHistory() {
  const root = $('#view-history');
  bindChartTips(root);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.lift) { statsLift = b.dataset.lift; render(); }
    else if (b.dataset.calnav) { calMonth = Math.max(0, calMonth + Number(b.dataset.calnav)); calDay = null; render(); }
    else if (b.dataset.calday) { calDay = calDay === b.dataset.calday ? null : b.dataset.calday; render(); }
    else if (b.dataset.xtab) { histTab = b.dataset.xtab; render(); }
    else if (b.dataset.pw || b.dataset.pwid || b.dataset.pwpose) photoWallClick(b);
    else if (b.dataset.act === 'bw') {
      const v = Number($('#bwInput').value);
      if (!(v > 30 && v < 300)) return toast('请输入正确的体重');
      state.bodyweight[dateKey(new Date())] = v;
      state.profile.weight = v;
      save(); render(); toast('已记录，营养目标已按新体重更新');
    }
  });
}
