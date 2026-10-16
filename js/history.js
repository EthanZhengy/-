'use strict';
/* ================= 历史: records & analytics ================= */

let statsLift = 'squat';
let histTab = 'log';
let calMonth = 0; // months back from this one
let calDay = null; // selected date key

/* ---------- 历史: month calendar, each day tagged with its volume and the muscles trained ---------- */
const CAT_NAME = { chest: '胸', back: '背', leg: '腿', glute: '臀', calf: '小腿', shoulder: '肩', bi: '二头', tri: '三头', core: '核心', grip: '前臂' };
/** Muscle groups of a saved result: r.cats since 1.22, else looked up from the exercise names. */
function resultCats(r) {
  const filled = (list) => (list || []).filter(Boolean);
  if (filled(r.doneCats).length) return filled(r.doneCats);
  if (filled(r.cats).length) return filled(r.cats);
  // older records, or exercises saved without a muscle group: work it out from the names
  return (r.names || []).map((name) => guessCat(name)).filter(Boolean);
}
let dayCache = {};
/** { vol, cats: ['腿','背'], cardio, offline, items: [{ title, sub, badge }] } for a date, or null when nothing was done. */
function dayStats(key) {
  if (key in dayCache) return dayCache[key];
  const l = state.logs[key];
  const date = parseKey(key);
  const out = { vol: 0, cats: {}, cardio: 0, offline: false, items: [] };
  const addCats = (list) => list.forEach((c) => { if (CAT_NAME[c]) out.cats[c] = (out.cats[c] || 0) + 1; });
  if (l && l.done && SESSIONS[l.session]) {
    const pos = position(state, date);
    const name = sessionName(l.session, pos ? pos.week : 1);
    if (l.offline) {
      const S = SESSIONS[l.session];
      const h = histByDay()[key];
      out.offline = true;
      out.vol += h ? h.volume : 0;
      addCats([S.main, S.secondary].filter(Boolean).map((x) => LIFT_CAT[x]));
      out.items.push({ title: name, sub: h ? `${esc(h.variant)} · 按计划估算` : '', badge: BADGE.offline });
    } else {
      const r = freeSummary(state, date, l, l.session);
      const h = histByDay()[key];
      out.vol += r.volume; addCats(r.doneCats.length ? r.doneCats : r.cats);
      out.items.push({ title: name, sub: `${r.done} 组 · ${Math.round(r.volume)}kg${h && h.top ? ` · 最重 ${fmtW(h.top.w)}kg × ${h.top.reps}` : ''}${h && h.e1rm ? ` · 1RM≈${fmtW(h.e1rm.value)}` : ''}`, badge: BADGE.app });
    }
  } else if (l && l.done && l.result && l.result.custom) {
    const r = l.result;
    out.vol += r.volume || 0; addCats(resultCats(r));
    out.items.push({ title: esc(r.title), sub: `${esc((r.names || []).slice(0, 4).join('、'))} · ${r.done} 组`, badge: BADGE.app });
  }
  if (l && l.free && l.free.done && l.free.result) {
    const r = l.free.result;
    out.vol += r.volume || 0; addCats(resultCats(r));
    out.items.push({ title: esc(r.title), sub: `${esc((r.names || []).slice(0, 4).join('、'))}${(r.names || []).length > 4 ? ' 等' : ''} · ${r.done} 组 · ${r.minutes} 分钟`, badge: BADGE.app });
  }
  (l && l.cardio || []).forEach((c) => {
    out.cardio++;
    out.items.push({ title: esc(cardioName(c.kind)), sub: `${c.min} 分钟${c.km ? ` · ${c.km} 公里` : ''} · ${c.kcal} 千卡`, badge: '' });
  });
  out.cats = Object.keys(out.cats).sort((x, y) => out.cats[y] - out.cats[x]).map((c) => CAT_NAME[c]);
  return (dayCache[key] = out.items.length ? out : null);
}
let histDayMap = null;
function histByDay() {
  if (!histDayMap) { histDayMap = {}; trainingHistory(state).forEach((h) => { histDayMap[dateKey(h.date)] = h; }); }
  return histDayMap;
}
const fmtVol = (v) => (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));

function calMonthStart() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() - calMonth, 1); }
function histHeadHtml() {
  const m0 = calMonthStart();
  const nav = histTab === 'log' ? `<div class="hx-month"><button class="hx-arrow" data-calnav="1" aria-label="上个月">${ICONS.back}</button>
      <div class="hx-ym"><small>${m0.getFullYear()}</small><b>${m0.getMonth() + 1}月</b></div>
      <button class="hx-arrow fwd" data-calnav="-1" aria-label="下个月" ${calMonth ? '' : 'disabled'}>${ICONS.back}</button></div>` : '<h1 class="hx-title">历史</h1>';
  return `<div class="hx-head">${nav}<div class="seg">${[['log', '历史'], ['data', '统计'], ['photos', '照片']].map(([k, l]) => `<button data-xtab="${k}" class="${histTab === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
}
function calendarPageHtml() {
  const now = new Date();
  const m0 = calMonthStart();
  const start = addDays(m0, -weekdayIdx(m0));
  const end = new Date(m0.getFullYear(), m0.getMonth() + 1, 0);
  const weeks = Math.ceil((dayDiff(start, end) + 1) / 7);
  let cells = '';
  const sum = { days: 0, vol: 0, cardio: 0 };
  const monthKeys = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(start, i);
    const key = dateKey(date);
    const inMonth = date.getMonth() === m0.getMonth();
    const st = dayStats(key);
    if (inMonth && st) { sum.days++; sum.vol += st.vol; sum.cardio += st.cardio; monthKeys.push(key); }
    const tags = st ? [
      st.vol ? `<i class="v${st.offline ? ' soft' : ''}">${fmtVol(st.vol)}</i>` : '',
      ...st.cats.slice(0, st.vol ? 2 : 3).map((c) => `<i>${c}</i>`),
      st.cardio && st.cats.length < 3 ? '<i class="c">有氧</i>' : '',
    ].join('') : '';
    const cls = [inMonth ? '' : 'out', key === dateKey(now) ? 'today' : '', key === calDay ? 'sel' : '', date > now ? 'future' : ''].filter(Boolean).join(' ');
    cells += `<button class="hx-day ${cls}" data-calday="${key}"><b>${date.getDate()}</b>${tags}</button>`;
  }
  let html = `<div class="hx-cal"><div class="hx-wd">${['一', '二', '三', '四', '五', '六', '日'].map((w) => `<span>${w}</span>`).join('')}</div><div class="hx-grid">${cells}</div></div>
    <div class="hx-sum"><div><b>${sum.days}</b><span>训练天数</span></div><div><b>${sum.vol >= 10000 ? (sum.vol / 1000).toFixed(1) : Math.round(sum.vol)}</b><span>${sum.vol >= 10000 ? '容量 (吨)' : '容量 (kg)'}</span></div><div><b>${sum.cardio}</b><span>有氧次数</span></div></div>`;
  const keys = calDay ? [calDay] : monthKeys.reverse();
  html += calDay ? `<div class="row between hx-lhead"><h3>${fmtDate(parseKey(calDay))} ${WEEKDAYS[weekdayIdx(parseKey(calDay))]}</h3><button class="link" data-calday="${calDay}">看整月</button></div>` : '';
  html += keys.map((k) => dayRowHtml(k)).join('') || `<p class="muted center pad">${calDay ? '这天没有训练记录' : '这个月还没有训练记录'}</p>`;
  return html;
}
function dayRowHtml(key) {
  const st = dayStats(key);
  if (!st) return '';
  const d = parseKey(key);
  return `<div class="hx-row"><div class="hx-date"><b>${d.getDate()}</b><span>${WEEKDAYS[weekdayIdx(d)]}</span></div>
    <div class="grow">${st.items.map((it) => `<div class="hx-item"><div class="row between"><b>${it.title}</b>${it.badge}</div>${it.sub ? `<div class="muted small">${it.sub}</div>` : ''}</div>`).join('')}
      ${st.cats.length ? `<div class="hx-tags">${st.cats.map((c) => `<i>${c}</i>`).join('')}</div>` : ''}</div>
    ${st.vol ? `<div class="hx-vol"><b>${fmtVol(st.vol)}</b><span>kg</span></div>` : ''}</div>`;
}

function renderHistory() {
  dayCache = {}; histDayMap = null;
  const body = histTab === 'photos' ? photoWallHtml() : histTab === 'data' ? statsTabHtml() : calendarPageHtml();
  $('#view-history').innerHTML = histHeadHtml() + body;
}

function statsTabHtml() {
  const today = new Date();
  const hist = trainingHistory(state);
  const weeks = weekly(state, today, hist);
  const pos = position(state, today);
  if (!pos || !hist.length && !weeks.some((w) => w.app + w.offline)) {
    return `<div class="card"><h2>还没有统计数据</h2>
      <p class="muted">完成第一次训练后，这里会显示力量曲线、训练量、完成热力图和个人纪录。</p>
      <p class="muted">如果之前已经在 App 外练过几周，可以在「挑战」里把那些训练标记为 📝 App 外完成。</p></div>${bodyweightCard(today)}`;
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
  html += `<div class="card"><h2>完成热力图</h2>
    <div class="legend"><span><i class="lg s1"></i>App 完成</span><span><i class="lg s1soft"></i>App 外完成</span><span><i class="lg none"></i>未训练</span></div>
    ${calendarChart(cells, labels)}
    <h3>每周完成情况</h3>
    <div class="weekbar">${recent.map((w) => `<span class="${w.app + w.offline >= w.required ? 'full' : w.current ? 'cur' : ''}" data-tip="第 ${w.week} 周 ${w.app + w.offline}/${w.required}">${w.app + w.offline}/${w.required}</span>`).join('')}</div></div>`;
  return html + bodyweightCard(today);
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
    else if (b.dataset.calday) {
      const k = b.dataset.calday;
      const d = parseKey(k), m0 = calMonthStart();
      if (d.getMonth() !== m0.getMonth()) { const n = new Date(); calMonth = (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth(); if (calMonth < 0) return; }
      calDay = calDay === k ? null : k; render();
    }
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
