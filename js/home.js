'use strict';
/* 训练 (home): food-log rings + quick actions, today's session, this week, meal advice. Plus the full-screen workout mode. */

let homeTab = 'today';

function todayInfo(date = new Date()) {
  const key = dateKey(date);
  const log = logFor(key);
  const pos = position(state, date);
  const rec = recommend(state, date);
  const sid = log.session || rec.session;
  const kind = sid === 'rest' || !pos ? 'rest' : LOWER[sid] ? 'lower' : 'upper';
  return { date, key, log, pos, rec, sid, kind, n: nutritionFor(state, kind) };
}
const KIND_LABEL = { lower: '下肢大重量日', upper: '上肢日', rest: '休息日' };

/* ---------- food log ---------- */
function eaten(log) {
  return (log.food || []).reduce((a, f) => ({ p: a.p + f.p, c: a.c + f.c, f: a.f + f.f, kcal: a.kcal + f.kcal }), { p: 0, c: 0, f: 0, kcal: 0 });
}
const kcalOf = (p, c, f) => Math.round(p * 4 + c * 4 + f * 9);
function quickMeals(n) {
  return n.training
    ? [['b', '早餐', 'breakfast'], ['l', '午餐', 'lunch'], ['post', '晚餐', 'dinner'], ['pre', '加餐', 'snack']]
    : [['b', '早餐', 'breakfast'], ['l', '午餐', 'lunch'], ['d', '晚餐', 'dinner'], ['s', '加餐', 'snack']];
}
function ring(value, target, cls, label, unit = '') {
  const pct = target ? Math.min(1, value / target) : 0;
  const C = 2 * Math.PI * 30;
  return `<div class="ring ${cls}">
    <div class="ring-fig"><svg viewBox="0 0 72 72"><circle class="trk" cx="36" cy="36" r="30"/>
      <circle class="val" cx="36" cy="36" r="30" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}" transform="rotate(-90 36 36)"/></svg>
      <div class="ring-txt"><b>${Math.round(value)}</b><small>${Math.round(value)}/${target}</small></div></div>
    <div class="ring-lbl">${label}${unit ? ` <span>(${unit})</span>` : ''}</div><div class="ring-pct">${Math.round(pct * 100)}%</div></div>`;
}
function dietCard(t) {
  const e = eaten(t.log);
  const water = (t.log.water || 0) * 250;
  const mealKeys = new Set((t.log.food || []).map((f) => f.meal));
  if (dietMode() === 'collapsed') {
    return `<button class="card diet diet-mini" data-diet-mode="on" aria-label="展开饮食记录">
      <span class="grow"><b>饮食</b> <span class="muted">${e.kcal} / ${t.n.kcal} 大卡 · 蛋白 ${Math.round(e.p)}/${t.n.protein}g · 饮水 ${water}ml</span></span><span class="diet-tgl">展开 ▾</span></button>`;
  }
  return `<div class="card diet">
    <div class="row between"><h2>饮食记录</h2><span class="row diet-acts"><span class="tag">${KIND_LABEL[t.n.kind]} · ${t.n.goal.label}</span>
      <button class="diet-tgl" data-diet-mode="collapsed">收起 ▴</button><button class="diet-tgl" data-diet-mode="off" aria-label="不需要饮食功能">✕</button></span></div>
    <div class="kcal"><b>${e.kcal}</b> / 目标 ${t.n.kcal} 大卡</div>
    <div class="rings">${ring(e.p, t.n.protein, 'r-p', '蛋白', 'g')}${ring(e.c, t.n.carbs, 'r-c', '碳水', 'g')}${ring(e.f, t.n.fat, 'r-f', '脂肪', 'g')}${ring(water, t.n.water, 'r-w', '饮水', 'ml')}</div>
    <div class="quick">
      ${quickMeals(t.n).map(([k, label, icon]) => `<button data-diet="${k}" class="${mealKeys.has(k) ? 'logged' : ''}">${ICONS[icon]}<span>${label}</span></button>`).join('')}
      <button data-diet="water">${ICONS.water}<span>饮水</span></button>
      <button data-diet="weight">${ICONS.scale}<span>记体重</span></button>
    </div></div>`;
}

function openMealSheet(mealKey) {
  const t = todayInfo();
  const meal = mealsFor(state, t.n).find((m) => m.key === mealKey);
  if (!meal) return;
  const entries = (t.log.food || []).map((f, i) => ({ ...f, i })).filter((f) => f.meal === mealKey);
  openSheet(`${meal.name} · ${meal.time}`, `
    <div class="advice"><div class="muted">建议</div><div>${esc(meal.food)}</div>
      <div class="muted">≈${meal.kcal} 千卡 · 蛋白 ${meal.protein}g · 碳水 ${meal.carbs}g · 脂肪 ${meal.fat}g</div>
      <button class="btn block" data-food-plan="${mealKey}">按建议记录</button></div>
    <h3>快速添加</h3>
    <div class="chips">${FOODS.map((f, i) => chip(esc(f.name), `data-food="${i}"`, false)).join('')}</div>
    <h3>自定义</h3>
    <div class="grid3"><div><label>蛋白 g</label><input type="number" inputmode="decimal" id="fp"></div>
      <div><label>碳水 g</label><input type="number" inputmode="decimal" id="fc"></div>
      <div><label>脂肪 g</label><input type="number" inputmode="decimal" id="ff"></div></div>
    <input id="fname" placeholder="名称（可选）" style="margin-top:8px"><button class="btn ghost block" data-food-custom>添加</button>
    ${entries.length ? `<h3>已记录</h3>${entries.map((f) => `<div class="row between line"><span>${esc(f.name)} <span class="muted">${f.kcal} 千卡 · 蛋白${Math.round(f.p)} 碳水${Math.round(f.c)} 脂肪${Math.round(f.f)}</span></span>
      <button class="icon-round sm" data-food-del="${f.i}" aria-label="删除">${ICONS.close}</button></div>`).join('')}` : ''}`,
  { type: 'meal', meal: mealKey, reopen: () => openMealSheet(mealKey) });
}
function openWaterSheet() {
  const t = todayInfo();
  const ml = (t.log.water || 0) * 250;
  openSheet('饮水', `<div class="big-num">${ml}<small> / ${t.n.water} ml</small></div>
    <div class="row wrap center"><button class="btn ghost" data-water="-1">−250ml</button><button class="btn" data-water="1">+250ml</button><button class="btn" data-water="2">+500ml</button></div>
    <p class="muted center">训练日多补 500ml 左右，训练中小口多次喝。</p>`, { type: 'water', reopen: openWaterSheet });
}
function openWeightSheet() {
  const k = dateKey(new Date());
  openSheet('记体重', `<input type="number" inputmode="decimal" step="0.1" id="bwInput" placeholder="今天的体重 (kg)" value="${state.bodyweight[k] ?? state.profile.weight}">
    <button class="btn block" data-act="bw">记录</button>
    <p class="muted">建议每天早上空腹称。体重会同步更新营养目标，在「历史 → 数据」里查看体重曲线。</p>`, { type: 'weight' });
}

/* ---------- home ---------- */
function greeting() {
  const h = new Date().getHours();
  return h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好';
}

function renderHome() {
  const t = todayInfo();
  const name = state.profile.name;
  let html = `<div class="page-head"><div><div class="muted">${fmtDate(t.date)} ${WEEKDAYS[weekdayIdx(t.date)]}</div>
    <h1>${greeting()}${name ? `，${esc(name)}` : ''}</h1></div>
</div>`;
  if (dietOn()) html += dietCard(t);
  else if (homeTab === 'food') homeTab = 'today';
  html += `<div class="utabs">${[['today', '今日训练'], ['week', '本周安排'], ...(dietOn() ? [['food', '饮食建议']] : [])].map(([k, l]) => `<button data-htab="${k}" class="${homeTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (homeTab === 'today') html += homeFreeHtml(t) + quoteCardHtml() + homeToday(t);
  else if (homeTab === 'week') html += homeWeek(t);
  else html += homeFood(t);
  $('#view-home').innerHTML = html;
}

const DAY_EN = { press: 'PRESS DAY', deadlift: 'DEADLIFT DAY', bench: 'BENCH DAY', squat: 'SQUAT DAY', mike1: 'PUSH DAY · 1', mike2: 'PUSH DAY · 2', mikeTest: 'TEST DAY' };
function homeToday(t) {
  if (!t.pos) {
    return `<div class="card hero"><div class="muted">计划还没开始</div><h2>${fmtDate(parseKey(state.startDate))}开始第 1 周</h2>
      <button class="btn light" data-act="start-now">现在就开始</button></div>`;
  }
  const { pos, log, rec, sid } = t;
  const order = orderFor(pos.week);
  const done = doneSessions(state, pos, t.key);
  const doneToday = log.done && log.session === sid;
  const status = (s) => sessionStatus(state, pos.weekAbs, s, t.date).status;

  let html = `<div class="card hero">
    <div class="row between"><span class="tag">${esc(progOf().short)} · 第 ${pos.cycle + 1} 轮 · 第 ${pos.week}/${progOf().weeks} 周</span></div>
    <h2>${esc(weekName(pos.week))}</h2>
    <div class="pills">${order.map((s, i) => { const st = status(s); return `<span class="pill ${st}">${st === 'app' ? '✓ ' : st === 'offline' ? '📝 ' : ''}${sessionName(s, pos.week)}${!isMike() && pos.week === 12 && i === 3 ? '(可选)' : ''}</span>`; }).join('')}</div></div>`;

  const yesterday = doneOn(state, addDays(t.date, -1));
  let warn = '';
  if (log.session && log.session !== rec.session && sid !== 'rest') {
    if (done.includes(sid)) warn = `${sessionName(sid, pos.week)}本周已经练过，这次算加练。`;
    else if (yesterday && LOWER[yesterday] && LOWER[sid]) warn = `昨天刚练${LIFT_NAMES[yesterday]}，连续两天练下肢恢复不足，建议选「疲劳」模式或换上肢日。`;
  }
  const notDone = order.filter((s) => !done.includes(s) && !(doneToday && s === sid));
  html += `<div class="card"><h2>今天想练什么？</h2>
    <div class="chips">${order.map((s) => chip(`${sessionName(s, pos.week)}${s === rec.session ? ' ⭐' : ''}${{ app: ' ✓', offline: ' 📝' }[status(s)] || ''}`, `data-pick="${s}"`, sid === s)).join('')}
    ${chip(`休息${rec.session === 'rest' ? ' ⭐' : ''}`, 'data-pick="rest"', sid === 'rest')}</div>
    <p class="muted">⭐ 推荐：${esc(rec.reason)}</p>
    ${warn ? `<p class="warn">⚠️ ${esc(warn)}</p>` : ''}
    ${sid !== 'rest' ? `<label>今天状态</label><div class="chips">${Object.entries(READINESS).map(([k, r]) => chip(r.label, `data-ready="${k}"`, (log.readiness || 'normal') === k)).join('')}</div>` : ''}
    ${notDone.length ? `<details class="offline-box"><summary>本周有训练是在 App 外完成的？</summary>
      <p class="muted">点一下标记为 📝 App 外完成，会计入本周进度和数据统计（按计划重量估算）。</p>
      <div class="chips">${notDone.map((s) => chip(`📝 ${sessionName(s, pos.week)}`, `data-offline="${s}"`, false)).join('')}</div></details>` : ''}
  </div>`;

  if (sid === 'rest') {
    html += `<div class="card"><h2>休息日 🧘</h2>${quotesOn() ? `<p class="rest-line">${esc(pickLine(REST_LINES))}</p>` : ''}<ul class="tips">
      <li>轻松散步 20–40 分钟，促进恢复</li><li>髋、胸椎、肩部拉伸 10 分钟</li><li>早点睡，睡眠是最好的恢复</li></ul></div>`;
    return html;
  }
  const s = sessionWithExtras(state, t.date, sid, log);
  const ticks = (k) => (log.sets[`${sid}:${k}`] || []).filter(Boolean).length;
  const nSets = (b) => blockRows(state, log, sid, b).length;
  const total = s.blocks.reduce((a, b) => a + nSets(b), 0);
  const doneSets = s.blocks.reduce((a, b) => a + ticks(b.key), 0);
  html += `<div class="card session">
    <div class="sess-en">${DAY_EN[sid] || (isCustomDay(sid) ? 'BONUS DAY' : 'TRAINING DAY')}</div>
    <div class="row between"><h2>${sessionName(sid, pos.week)}</h2>${doneToday ? BADGE.app : `<span class="muted">${doneSets}/${total} 组</span>`}</div>
    ${s.blocks.map((b) => `<div class="srow"><span class="dot${ticks(b.key) >= nSets(b) ? ' on' : ''}"></span>
      <div class="grow"><div>${esc(b.title.replace(/^(主项|第二主项|辅助|激活|五选一|自选|模板|拉类动作|腹肌核心|上肢辅助|下肢辅助) · /, ''))}</div>
      <div class="muted">${b.type === 'main' ? b.rows.map((r) => `${fmtW(r.w)}×${r.reps}${r.plus ? '+' : ''}`).join(' · ') : `${b.w ? `${fmtW(b.w)}kg · ` : ''}${b.sets} 组 × ${esc(b.reps)}`}</div></div>
      <span class="muted small">${esc(b.title.split(' · ')[0])}</span></div>`).join('')}
    <button class="btn block big" data-act="start">${doneToday ? '查看训练' : doneSets ? '继续训练' : '开始训练'}</button></div>`;
  return html;
}

function homeWeek(t) {
  if (!t.pos) return '<div class="card"><p class="muted">计划还没开始。</p></div>';
  const { pos } = t;
  const rp = remainingPlan(state, t.date, t.sid);
  let html = `<div class="card"><h2>第 ${pos.week} 周 · ${esc(weekName(pos.week))}</h2>
    <p class="muted">${fmtDate(pos.weekStart)} – ${fmtDate(pos.weekEnd)}</p>${weekPreviewHtml(state, pos.weekAbs, false, true)}</div>`;
  if (rp.plan.length || rp.unplaced.length) {
    html += `<div class="card"><h2>接下来</h2>
      ${rp.plan.map((p) => `<div class="row between line"><span>${WEEKDAYS[weekdayIdx(p.date)]} ${fmtDate(p.date)}</span><b>${sessionName(p.session, pos.week)}</b></div>`).join('')}
      ${rp.unplaced.length ? `<p class="warn">本周可能练不完：${rp.unplaced.map((s) => sessionName(s, pos.week)).join('、')}。可以在「挑战」里把整个计划顺延一周。</p>` : ''}
      <p class="muted">根据你实际练了什么自动调整，并尽量避免连续两天练下肢。</p></div>`;
  }
  return html;
}

function homeFood(t) {
  return `<div class="card"><div class="row between"><h2>今日目标</h2><span class="tag">${KIND_LABEL[t.n.kind]}</span></div>${macrosHtml(t.n)}</div>
    <div class="card"><h2>餐次安排</h2>
    ${mealsFor(state, t.n).map((m) => `<button class="meal-row" data-diet="${m.key}">
      <div class="row between"><b>${m.name}</b><span class="muted">${m.time}</span></div>
      <div class="muted">≈${m.kcal} 千卡 · 蛋白 ${m.protein}g · 碳水 ${m.carbs}g · 脂肪 ${m.fat}g</div>
      <div class="food">${m.food}</div></button>`).join('')}</div>
    <div class="card"><h2>今日建议</h2><ul class="tips">${nutritionTips(t.n).map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
}

function bindHome() {
  const root = $('#view-home');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const t = todayInfo();
    const ds = b.dataset;
    if (ds.htab) homeTab = ds.htab;
    else if (ds.dietMode) {
      if (ds.dietMode === 'off' && !confirm('不需要饮食功能？\n\n首页的饮食记录、饮食建议和吃饭提醒都会隐藏，已记录的数据会保留。\n随时可以在「我的 → 饮食与营养」恢复。')) return;
      state.dietMode = ds.dietMode;
      if (ds.dietMode === 'off') { toast('已隐藏饮食功能，可在「我的 → 饮食与营养」恢复'); syncPushSoon(); }
    }
    else if (ds.diet) {
      if (ds.diet === 'water') return openWaterSheet();
      if (ds.diet === 'weight') return openWeightSheet();
      return openMealSheet(ds.diet);
    } else if (ds.pick) {
      if (t.log.done && ds.pick !== t.log.session) return toast('今天已标记完成，先撤销再换');
      t.log.session = ds.pick;
    } else if (ds.ready) t.log.readiness = ds.ready;
    else if (ds.offline) {
      if (!markOffline(state, t.pos.weekAbs, ds.offline, t.date)) return toast('本周已经没有空的日期可以标记了');
      toast(`已标记：${sessionName(ds.offline, t.pos.week)} 📝 App 外完成`);
    } else if (ds.mark || ds.unmark) {
      const w = Number(ds.week);
      if (ds.mark) { if (!markOffline(state, w, ds.mark, t.date)) return toast('这一周没有空的日期可以标记'); }
      else unmarkOffline(state, w, ds.unmark);
    } else if (ds.act === 'start') { wkMode = 'plan'; currentView = 'workout'; render(); window.scrollTo(0, 0); return; }
    else if (ds.act === 'friends') return openFriends();
    else if (ds.act === 'start-now') state.startDate = dateKey(mondayOf(t.date));
    else return;
    save(); render();
  });
}

/* Sheet actions (food, water, weight) */
function bindSheet() {
  const root = $('#sheet');
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-sheet-close]')) return closeSheet();
    const b = e.target.closest('button');
    if (!b || !sheetCtx) return;
    const ds = b.dataset;
    const t = todayInfo();
    const log = t.log;
    log.food = log.food || [];
    if (ds.foodPlan) {
      const m = mealsFor(state, t.n).find((x) => x.key === ds.foodPlan);
      log.food.push({ meal: m.key, name: `${m.name}（按建议）`, p: m.protein, c: m.carbs, f: m.fat, kcal: m.kcal });
      toast(`已记录${m.name}`);
    } else if (ds.food) {
      const f = FOODS[Number(ds.food)];
      log.food.push({ meal: sheetCtx.meal, name: f.name, p: f.p, c: f.c, f: f.f, kcal: kcalOf(f.p, f.c, f.f) });
      toast(`+ ${f.name}`);
    } else if (ds.foodCustom !== undefined) {
      const p = Number($('#fp').value) || 0, c = Number($('#fc').value) || 0, f = Number($('#ff').value) || 0;
      if (!p && !c && !f) return toast('请至少填一项');
      log.food.push({ meal: sheetCtx.meal, name: $('#fname').value.trim() || '自定义', p, c, f, kcal: kcalOf(p, c, f) });
    } else if (ds.foodDel) log.food.splice(Number(ds.foodDel), 1);
    else if (ds.water) log.water = Math.max(0, (log.water || 0) + Number(ds.water));
    else if (ds.act === 'bw') {
      const v = Number($('#bwInput').value);
      if (!(v > 30 && v < 300)) return toast('请输入正确的体重');
      state.bodyweight[t.key] = v;
      state.profile.weight = v;
      save(); closeSheet(); render(); return toast('已记录，营养目标已按新体重更新');
    } else return;
    save(); render(); refreshSheet();
  });
}

/* ================= Workout mode ================= */

function snapshot(date, log) {
  if (log.done && !log.offline && SESSIONS[log.session]) log.result = summarizeSession(state, date, log.session, log);
  else if (log.done && isCustomDay(log.session)) log.result = { ...freeSummary(state, date, log, log.session), title: sessionName(log.session), custom: true };
  else delete log.result;
  postActivity(date, log); // share the day's workout with friends (no-op when signed out)
}

/* The workout screen runs either today's plan session ('plan') or a free workout ('free'). */
let wkMode = 'plan';
const wkSid = (t) => (wkMode === 'free' ? 'free' : t.sid);

function renderWorkout() {
  if (wkMode === 'free') return renderFree();
  const t = todayInfo();
  if (!t.pos || t.sid === 'rest') { currentView = 'home'; return render(); }
  const s = sessionWithExtras(state, t.date, t.sid, t.log);
  const doneToday = t.log.done && t.log.session === t.sid;
  const w = workoutStats(s, t.log, t.sid);
  $('#view-workout').innerHTML = `<div class="wk-head"><button class="icon-round" data-act="back" aria-label="返回">${ICONS.back}</button>
      <div class="grow"><b>${sessionName(t.sid, t.pos.week)}</b><div class="muted">第 ${t.pos.week} 周 · ${esc(weekName(t.pos.week))} · ${READINESS[t.log.readiness || 'normal'].label}</div></div>
      <div class="wk-stats"><span><b>${w.done}</b>/${w.sets} 组</span><span><b>${w.exDone}</b>/${w.ex} 动作</span><span><b>${fmtKg(w.volDone)}</b>/${fmtKg(w.vol)} 容量</span></div></div>
    ${workoutHtml(s, t.log, t.sid, doneToday)}`;
}

/* Default rest per block; the user can change it per exercise (state.restPref). */
const REST_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300];
const restKey = (b) => (b.ex ? b.ex.id : b.title.replace(/^.*· /, ''));
function restFor(b) {
  const p = state.restPref && state.restPref[restKey(b)];
  if (p) return p;
  return b.type === 'main' ? (b.test ? 240 : 180) : b.key === 'sec' ? 120 : 90;
}
const fmtRest = (sec) => (sec % 60 ? (sec > 60 ? `${Math.floor(sec / 60)}分${sec % 60}秒` : `${sec}秒`) : `${sec / 60}分钟`);
const repUnit = (b) => (/秒/.test(b.reps || '') ? '秒' : /米/.test(b.reps || '') ? '米' : '次');

function setRowHtml(b, rows, r, i, done, key) {
  const workN = rows.slice(0, i + 1).filter((x) => x.t === 'work').length;
  const tag = r.t === 'work' ? workN : SET_TYPES[r.t][0];
  const am = r.plus && r.r !== r.planR;
  const meta = b.rows ? (r.label || (r.single ? '单次组' : r.pct ? `${r.pct}%` : '')) : '';
  return `<div class="setrow ed${done ? ' done' : ''} t-${r.t}">
    <button class="stype" data-stype="${b.key}" data-i="${i}" aria-label="组类型：${SET_TYPES[r.t]}">${tag}</button>
    <label class="fld"><input type="number" inputmode="decimal" step="0.5" min="0" data-sw="${b.key}" data-i="${i}" value="${r.w ?? ''}" placeholder="${repUnit(b) === '次' ? '重量' : '负重'}"><span>kg</span></label>
    <span class="x">×</span>
    <label class="fld"><input type="number" inputmode="numeric" min="0" data-sr="${b.key}" data-i="${i}" value="${r.plus && !am ? '' : r.r ?? ''}" placeholder="${r.plus ? `${r.planR}+` : ''}"><span>${repUnit(b)}</span></label>
    <span class="meta">${esc(meta)}</span>
    <button class="tick" data-tick="${b.key}" data-i="${i}" data-rest="${restFor(b)}" aria-label="完成第 ${i + 1} 组">✓</button>
  </div>${am ? `<div class="muted e1rm">估算 1RM ≈ ${fmtW(Math.round(epley(Number(r.w) || 0, Number(r.r)) * 2) / 2)}kg</div>` : ''}`;
}

/* Exercise cards: collapsed to one line (photo, sets, progress dots, volume); tap to open the set rows. */
let wkOpen; // key of the open card; undefined = first unfinished, '' = all closed
const LIFT_CHAR = { press: '推', bench: '卧', squat: '蹲', deadlift: '拉' };
function blockProgress(log, sid, b) {
  const rows = blockRows(state, log, sid, b);
  const ticks = log.sets[`${sid}:${b.key}`] || [];
  let vol = 0, volDone = 0, done = 0;
  rows.forEach((r, i) => {
    const v = r.t === 'warm' ? 0 : (Number(r.w) || 0) * (Number(r.r) || Number(r.planR) || 0);
    vol += v;
    if (ticks[i]) { done++; volDone += v; }
  });
  return { rows, ticks, done, vol, volDone, full: rows.length > 0 && done >= rows.length };
}
function openBlockKey(s, log, sid) {
  if (wkOpen !== undefined && (wkOpen === '' || s.blocks.some((b) => b.key === wkOpen))) return wkOpen;
  const b = s.blocks.find((x) => !blockProgress(log, sid, x).full);
  return b ? b.key : '';
}
function workoutStats(s, log, sid) {
  const p = s.blocks.map((b) => blockProgress(log, sid, b));
  return {
    sets: p.reduce((a, x) => a + x.rows.length, 0), done: p.reduce((a, x) => a + x.done, 0),
    ex: p.length, exDone: p.filter((x) => x.full).length,
    vol: p.reduce((a, x) => a + x.vol, 0), volDone: p.reduce((a, x) => a + x.volDone, 0),
  };
}
const fmtKg = (v) => (Math.round(v * 10) / 10).toFixed(1);
function blockHtml(s, b, log, sid, open) {
  const key = (k) => `${sid}:${k}`;
  const pr = blockProgress(log, sid, b);
  const { rows, ticks } = pr;
  const name = b.title.split(' · ').slice(1).join(' · ') || b.title;
  const img = (b.ex && b.ex.img) || b.img;
  const kind = b.title.split(' · ')[0];
  const thumb = img ? `<img src="${exImgUrl(img, 0)}" alt="" loading="lazy">` : `<i>${esc(LIFT_CHAR[b.lift] || name.slice(0, 1))}</i>`;
  let html = `<div class="card wb${open ? ' open' : ''}${pr.full ? ' fin' : ''}">
    <button class="wb-head" data-wbopen="${b.key}" aria-expanded="${open}">
      <span class="wb-thumb">${thumb}</span>
      <span class="wb-main"><span class="wb-kind">${esc(kind)}</span><b class="wb-name">${esc(name)}</b>
        <span class="wb-sub">${rows.length} 组${b.sub ? ` · ${esc(b.sub)}` : ''}</span>
        <span class="wb-dots">${rows.map((r, i) => `<i class="${ticks[i] ? 'on' : ''}${r.t === 'warm' ? ' w' : ''}"></i>`).join('')}</span></span>
      <span class="wb-vol">${pr.vol ? `${fmtKg(pr.volDone)}<small>/${fmtKg(pr.vol)}</small>` : `${pr.done}<small>/${rows.length} 组</small>`}</span>
      <span class="wb-chev">${ICONS.chevron}</span>
    </button>`;
  if (!open) return `${html}</div>`;
  html += '<div class="wb-body">';
  const plan = b.tpl && b.rows ? `跟随主项强度 · 1RM ≈ ${fmtW(b.oneRM)}kg` : b.rows ? '' : `计划 ${b.w ? `${fmtW(b.w)}kg × ` : ''}${esc(b.reps)}${/[秒米]/.test(b.reps) ? '' : ' 次'} × ${b.sets} 组`;
  html += `<div class="blk-tools"><button class="rest-chip" data-restcfg="${b.key}">⏱ 休息 ${fmtRest(restFor(b))}</button>
    ${b.ex && b.slot && !b.extra && !b.tpl ? `<button class="rest-chip alt" data-swap="${b.key}" data-slot="${b.slot}">⇄ 换一个</button>` : ''}
    <span class="muted small grow right">${plan}</span></div>`;
  if (img || (b.ex && b.ex.cue) || b.note) {
    html += `<details class="wb-how"${b.note && !img ? ' open' : ''}><summary>动作要领</summary>
      ${img ? `<div class="blk-photo"><img src="${exImgUrl(img, 0)}" alt="" loading="lazy"><img src="${exImgUrl(img, 1)}" alt="" loading="lazy"></div>` : ''}
      ${b.ex && b.ex.cue ? `<p class="cue">${esc(b.ex.cue)}</p>` : ''}${b.note ? `<p class="cue">${esc(b.note)}</p>` : ''}</details>`;
  }
  rows.forEach((r, i) => { html += setRowHtml(b, rows, r, i, ticks[i], key(b.key)); });
  html += `<div class="set-actions"><button data-addset="${b.key}">＋ 加一组</button>${rows.length > 1 ? `<button data-delset="${b.key}">－ 删一组</button>` : ''}<button data-exhist="${b.key}">动作历史</button></div>
    ${b.extra ? `<div class="set-actions"><button class="danger" data-delex="${b.key}">移除动作</button></div>` : b.tpl ? `<div class="set-actions"><button data-tploff="${b.key}">今天不练</button></div>` : ''}`;
  if (b.test) {
    const val = state.tests[s.pos.cycle] && state.tests[s.pos.cycle][b.lift];
    html += `<label>测得的新 1RM (kg)</label><input type="number" inputmode="decimal" step="0.5" data-test="${b.lift}" value="${val ?? ''}" placeholder="最后一次标准完成的重量">
      <p class="muted">填写后，下一轮的 TM 会按新 1RM × 90% 自动计算。</p>`;
  }
  return `${html}</div></div>`;
}
function blocksHtml(s, log, sid) {
  const ok = openBlockKey(s, log, sid);
  return s.blocks.map((b) => blockHtml(s, b, log, sid, b.key === ok)).join('');
}

function workoutHtml(s, log, sid, doneToday) {
  let html = '';
  if (s.notes.length) html += `<ul class="notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  html += blocksHtml(s, log, sid);
  html += '<button class="btn ghost block" data-act="add-extra">＋ 添加动作</button>';
  html += doneToday
    ? `<div class="card center">${BADGE.app}<p>今天的训练已完成，记得吃练后餐。</p><button class="btn ghost block" data-act="undo-done">撤销完成</button></div>`
    : '<button class="btn block big" data-act="done">✅ 完成今天的训练</button>';
  html += '<p class="muted small center">点组号切换 正式 / 热身 / 递减 / 力竭；重量和次数可以直接改</p>';
  return html;
}

/** Copy the planned rows into log.sx so they can be edited. */
function editRows(log, sid, b) {
  const k = `${sid}:${b.key}`;
  if (!log.sx[k]) log.sx[k] = blockRows(state, log, sid, b).map(() => ({}));
  return log.sx[k];
}

/* 「换一个」: choose a same-type alternative, or search the whole library. */
let swapQ = '';
function swapCtx() {
  const t = todayInfo();
  const s = sessionWithExtras(state, t.date, t.sid, t.log);
  const b = s.blocks.find((x) => x.key === sheetCtx.key);
  return { t, s, b };
}
function swapListHtml(key) {
  const t = todayInfo();
  const s = sessionWithExtras(state, t.date, t.sid, t.log);
  const b = s.blocks.find((x) => x.key === key);
  if (!b) return '';
  const used = s.blocks.filter((x) => x.ex && x.key !== key).map((x) => x.ex.id);
  const row = (it, note) => `<button class="pick-row${it.id === b.ex.id ? ' on' : ''}" data-swpick="${esc(it.id)}">${exArt(it, 'pick-art')}
    <span class="grow">${esc(it.name)}${note ? `<span class="muted small"> · ${esc(note)}</span>` : ''}</span><span class="muted">${it.id === b.ex.id ? '当前' : '选择'}</span></button>`;
  const q = swapQ.trim().toLowerCase();
  if (q) {
    const hits = libraryItems().filter((it) => it.name.toLowerCase().includes(q) || (it.en || '').toLowerCase().includes(q))
      .filter((it, i, a) => a.findIndex((x) => x.id === it.id) === i && !used.includes(it.id)).slice(0, 60);
    return hits.length ? hits.map((it) => row(it, (it.cats || []).map((c) => (LIB_CATS.find(([k]) => k === c) || [, ''])[1]).filter(Boolean).join('/'))).join('')
      : `<p class="muted">没有找到「${esc(swapQ.trim())}」，换个关键词试试${exdbState === 'loading' ? '（动作库加载中…）' : ''}</p>`;
  }
  const list = ranked(state, b.slot, t.sid, t.date, true).map((x) => x.e).filter((x) => !used.includes(x.id));
  return `<p class="muted small">同类替代 · ${SLOT_NAMES[b.slot] || ''}（按适合今天的程度排序，❤️ 是你喜欢的）</p>`
    + list.map((e) => row(e, `${state.favorites.includes(e.id) ? '❤️ ' : ''}${e.reps || ''}`)).join('');
}
function openSwap(key) {
  ensureExdb();
  const t = todayInfo();
  const b = sessionWithExtras(state, t.date, t.sid, t.log).blocks.find((x) => x.key === key);
  if (!b) return;
  const swapped = (t.log.swaps[t.sid] || {})[key];
  openSheet(`替换：${b.ex.name}`, `<label class="search">${ICONS.search}<input id="swSearch" placeholder="搜索任意动作（中文或英文）" value="${esc(swapQ)}"></label>
    <div id="swList">${swapListHtml(key)}</div>
    ${swapped ? '<button class="btn ghost block" data-swreset="1">恢复系统推荐的动作</button>' : ''}`, { type: 'swap', key, reopen: () => openSwap(key) });
}
function applySwap(id) {
  const { t, b } = swapCtx();
  const sid = t.sid, key = sheetCtx.key;
  if (!exById(state, id)) {
    // picked from the full library: keep a copy so the planner can show it (never auto-scheduled)
    const it = libraryItems().find((x) => x.id === id);
    if (!it) return;
    const { s: steps, sm, en, kind, cats, lift, ...keep } = it;
    state.customEx = (state.customEx || []).concat({ ...keep, id, name: it.name.replace(/（单只重量）/, ''), slot: b.slot, m: it.m || 'custom',
      eq: it.eq || [], reps: it.reps || '8-12', img: it.img || null, cue: it.cue || (steps && steps[0]) || '', db: !!it.pe, cats: it.cats, pickOnly: true });
  }
  t.log.swaps[sid] = { ...(t.log.swaps[sid] || {}), [key]: id };
  delete t.log.sx[`${sid}:${key}`]; delete t.log.sets[`${sid}:${key}`];
  snapshot(t.date, t.log); save(); closeSheet(); render();
  toast(`已换成：${exById(state, id).name}`);
}

/* Exercise picker for 「添加动作」: same list as the 动作 tab. */
let pick = { q: '', cat: 'chest', target: null };
function pickListHtml() {
  const q = pick.q.trim().toLowerCase();
  const items = libraryItems().filter((it) => (q ? it.name.toLowerCase().includes(q) || (it.en || '').toLowerCase().includes(q) : it.cats.includes(pick.cat)))
    .filter((it, i, a) => a.findIndex((x) => x.id === it.id) === i).slice(0, 80);
  return items.map((it) => `<button class="pick-row" data-pick="${esc(it.id)}">${exArt(it, 'pick-art')}<span class="grow">${esc(it.name)}</span><span class="muted">＋</span></button>`).join('')
    || '<p class="muted">没有找到动作</p>';
}
function openPicker() {
  ensureExdb();
  openSheet('添加动作', `<label class="search">${ICONS.search}<input id="pxSearch" placeholder="搜索动作" value="${esc(pick.q)}"></label>
    <div class="eq-chips">${LIB_CATS.filter(([k]) => k !== 'custom').map(([k, l]) => `<button data-pcat="${k}" class="${pick.cat === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="pxList">${pickListHtml()}</div>`, { type: 'pickex', reopen: openPicker });
}
function addExtra(it) {
  const t = todayInfo();
  if (wkMode !== 'free' && (!t.pos || t.sid === 'rest')) startFree(); // nothing planned today: start a free workout
  const sid = wkSid(t);
  if (sid === 'free') freeLog(t.log).startedAt = freeLog(t.log).startedAt || (freeLog(t.log).elapsed ? null : Date.now());
  const list = t.log.extra[sid] = t.log.extra[sid] || [];
  const nk = Date.now().toString(36);
  wkOpen = `x${nk}`; // open the new card
  list.push({ k: nk, id: it.id, name: it.name, img: it.img || null, cue: it.cue || (it.s && it.s[0]) || '', reps: String(firstInt(it.reps) || 10) });
  snapshot(t.date, t.log); save();
  toast(`已加入今天的训练：${it.name}`);
}
function openRestPicker(bkey) {
  const t = todayInfo();
  const b = sessionWithExtras(state, t.date, wkSid(t), t.log).blocks.find((x) => x.key === bkey);
  if (!b) return;
  const cur = restFor(b);
  openSheet(`休息时间 · ${b.title.replace(/^.*· /, '')}`, `<div class="rest-step"><button class="icon-round" data-reststep="-15" aria-label="减少 15 秒">−</button>
      <b>${fmtRest(cur)}</b><button class="icon-round" data-reststep="15" aria-label="增加 15 秒">＋</button></div>
    <p class="muted center small">每次 ±15 秒，或直接选：</p><div class="chips">${REST_OPTIONS.map((sec) => `<button class="chip${sec === cur ? ' on' : ''}" data-restset="${sec}">${fmtRest(sec)}</button>`).join('')}</div>
    <p class="muted">每次完成一组后自动开始倒计时。这个动作以后都会用这个休息时间。</p>`, { type: 'rest', rk: restKey(b), cur });
}

/* Rest timer shown after ticking a set */
let restTimer = null;
function startRest(sec) {
  clearInterval(restTimer && restTimer.iv);
  restTimer = { end: Date.now() + sec * 1000, total: sec };
  restTimer.iv = setInterval(drawRest, 250);
  drawRest();
}
function stopRest() { if (restTimer) clearInterval(restTimer.iv); restTimer = null; restMode = ''; $('#rest').hidden = true; }

/* On the workout screen the timer is a bar; elsewhere (or after 缩小) it is a round bubble you can drag anywhere. */
let restMini = null; // null = automatic
let restView = '';
let restMode = '';
const REST_RING = 2 * Math.PI * 28;
const restIsMini = () => (restMini ?? currentView !== 'workout');
function restPos() { try { return JSON.parse(localStorage.getItem('ianz-rest-pos')) || null; } catch { return null; } }
function applyRestPos(el) {
  if (restMode !== 'mini') { el.style.left = el.style.top = ''; return; }
  const p = restPos() || { side: 'right', y: 0.62 };
  const size = el.offsetWidth || 72;
  el.style.left = `${p.side === 'left' ? 12 : innerWidth - size - 12}px`;
  el.style.top = `${Math.min(innerHeight - size - 90, Math.max(50, p.y * innerHeight))}px`;
}
function drawRest() {
  const el = $('#rest');
  if (!restTimer) { el.hidden = true; return; }
  const left = Math.max(0, Math.round((restTimer.end - Date.now()) / 1000));
  if (left === 0) {
    stopRest();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    return toast('⏰ 休息结束，开始下一组');
  }
  if (restView !== currentView) { restView = currentView; restMini = null; }
  el.hidden = false;
  const mode = restIsMini() ? 'mini' : 'bar';
  if (restMode !== mode || !el.firstChild) {
    restMode = mode;
    el.classList.toggle('mini', mode === 'mini');
    el.innerHTML = mode === 'mini'
      ? `<svg class="rest-ring" viewBox="0 0 64 64" aria-hidden="true"><circle class="trk" cx="32" cy="32" r="28"/><circle class="val" cx="32" cy="32" r="28" transform="rotate(-90 32 32)" stroke-dasharray="${REST_RING.toFixed(1)}"/></svg><b></b><small>休息</small>`
      : `<div class="rest-bar"></div><span>休息</span><b></b>
        <button data-rest-add="-30" aria-label="减少 30 秒">−30s</button><button data-rest-add="30" aria-label="增加 30 秒">+30s</button><button data-rest-skip>跳过</button>
        <button class="rest-min" data-rest-min aria-label="缩小成悬浮球">⌄</button>`;
    el.setAttribute('aria-label', mode === 'mini' ? '休息倒计时，点开查看' : '休息倒计时');
    applyRestPos(el);
  }
  const frac = left / restTimer.total;
  el.querySelector('b').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  if (mode === 'mini') el.querySelector('.val').style.strokeDashoffset = (REST_RING * (1 - frac)).toFixed(1);
  else el.querySelector('.rest-bar').style.width = `${frac * 100}%`;
}
/* Drag the bubble; it snaps to the nearest side and remembers where it was. */
function bindRestDrag() {
  const el = $('#rest');
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (restMode !== 'mini') return;
    const r = el.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) > 6) drag.moved = true;
    if (!drag.moved) return;
    el.classList.add('dragging');
    el.style.left = `${e.clientX - drag.dx}px`;
    el.style.top = `${e.clientY - drag.dy}px`;
  });
  const end = () => {
    if (!drag) return;
    el.classList.remove('dragging');
    if (drag.moved) {
      const r = el.getBoundingClientRect();
      try { localStorage.setItem('ianz-rest-pos', JSON.stringify({ side: r.left + r.width / 2 < innerWidth / 2 ? 'left' : 'right', y: r.top / innerHeight })); } catch { /* private mode */ }
      applyRestPos(el);
      el.dataset.dragged = '1'; // swallow the click that follows a drag
      setTimeout(() => { delete el.dataset.dragged; }, 50);
    }
    drag = null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  addEventListener('resize', () => applyRestPos(el));
}

function bindWorkout() {
  const root = $('#view-workout');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const t = todayInfo();
    const { log } = t;
    const sid = wkSid(t);
    const ds = b.dataset;
    if (ds.act === 'back') { currentView = 'home'; render(); return; }
    if (ds.fact) return freeAction(ds.fact, t);
    if (ds.wbopen) {
      const s = sessionWithExtras(state, t.date, sid, log);
      wkOpen = openBlockKey(s, log, sid) === ds.wbopen ? '' : ds.wbopen;
      render();
      const el = document.querySelector(`[data-wbopen="${ds.wbopen}"]`);
      if (el && wkOpen) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const blk = (k) => sessionWithExtras(state, t.date, sid, log).blocks.find((x) => x.key === k);
    if (ds.tick) {
      const k = `${sid}:${ds.tick}`;
      log.sets[k] = log.sets[k] || [];
      log.sets[k][ds.i] = !log.sets[k][ds.i];
      if (log.sets[k][ds.i]) {
        const bb = blk(ds.tick);
        const r = bb && blockRows(state, log, sid, bb)[ds.i];
        if (bb && bb.ex && r && r.w) state.lastW[bb.ex.id] = { w: Number(r.w), r: Number(r.r) || 0 };
        startRest(Number(ds.rest) || 90);
        // last set of this exercise: open the next unfinished one
        if (bb && blockProgress(log, sid, bb).full) wkOpen = undefined;
        if (sid === 'free' && !freeLog(log).startedAt && !freeLog(log).done) freeLog(log).startedAt = Date.now();
      }
    } else if (ds.stype) {
      const rows = editRows(log, sid, blk(ds.stype));
      const curT = blockRows(state, log, sid, blk(ds.stype))[ds.i].t;
      rows[ds.i].t = SET_TYPE_ORDER[(SET_TYPE_ORDER.indexOf(curT) + 1) % SET_TYPE_ORDER.length];
      toast(SET_TYPES[rows[ds.i].t]);
    } else if (ds.addset) {
      const bb = blk(ds.addset);
      const cur = blockRows(state, log, sid, bb);
      const last = cur[cur.length - 1] || {};
      editRows(log, sid, bb).push({ w: last.w ?? null, r: last.r ?? 10, t: last.t === 'warm' ? 'work' : last.t || 'work' });
    } else if (ds.delset) {
      const rows = editRows(log, sid, blk(ds.delset));
      if (rows.length > 1) rows.pop();
      const tk = log.sets[`${sid}:${ds.delset}`];
      if (tk) tk.length = Math.min(tk.length, rows.length);
    } else if (ds.delex) {
      log.extra[sid] = (log.extra[sid] || []).filter((x) => `x${x.k}` !== ds.delex);
      delete log.sx[`${sid}:${ds.delex}`]; delete log.sets[`${sid}:${ds.delex}`];
    } else if (ds.tploff) {
      const k = ds.tploff.slice(1);
      const all = ((state.tplEx || {})[sid] || []).map((x) => x.k);
      log.tplPick = log.tplPick || {};
      log.tplPick[sid] = (log.tplPick[sid] || all).filter((x) => x !== k);
      delete log.sx[`${sid}:${ds.tploff}`]; delete log.sets[`${sid}:${ds.tploff}`];
      toast('今天不练这个动作，模板里仍然保留');
    } else if (ds.restcfg) return openRestPicker(ds.restcfg);
    else if (ds.exhist) {
      const bb = blk(ds.exhist);
      if (!bb) return;
      exh.tab = 'hist';
      return openExHistory(blockName(bb), (bb.ex && bb.ex.img) || bb.img, (bb.ex && bb.ex.cue) || bb.note);
    }
    else if (ds.act === 'add-extra') return openPicker();
    else if (ds.swap) { swapQ = ''; return openSwap(ds.swap); }
    else if (ds.act === 'done') {
      log.session = sid; log.done = true; log.offline = false;
      stopRest();
      toast(`💪 ${doneLine()}`);
    } else if (ds.act === 'undo-done') log.done = false;
    else return;
    snapshot(t.date, log);
    save(); render();
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    const t = todayInfo();
    const ds = el.dataset;
    const sid = wkSid(t);
    if (ds.sw || ds.sr) {
      const bkey = ds.sw || ds.sr;
      const b = sessionWithExtras(state, t.date, sid, t.log).blocks.find((x) => x.key === bkey);
      if (!b) return;
      const v = el.value === '' ? null : Number(el.value);
      const row = blockRows(state, t.log, sid, b)[ds.i];
      if (ds.sr && row.plus) {
        t.log.amrap[`${sid}:${bkey}:${ds.i}`] = v || undefined;
        snapshot(t.date, t.log); save(); render();
        return;
      }
      editRows(t.log, sid, b)[ds.i][ds.sw ? 'w' : 'r'] = v;
      snapshot(t.date, t.log); save();
      if (sid === 'free') updateFreeStats();
    } else if (el.dataset.test) {
      state.tests[t.pos.cycle] = { ...(state.tests[t.pos.cycle] || {}), [el.dataset.test]: Number(el.value) || undefined };
      snapshot(t.date, t.log); save();
      toast('已记录，下一轮计划会自动更新');
    }
  });
  // exercise picker and rest-time sheets
  $('#sheet').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !sheetCtx) return;
    const ds = b.dataset;
    if (sheetCtx.type === 'pickex') {
      if (ds.pcat) { pick.cat = ds.pcat; pick.q = ''; refreshSheet(); }
      else if (ds.pick) {
        const it = libraryItems().find((x) => x.id === ds.pick);
        if (it && pick.target === 'tpl') { pick.target = null; return tplPicked(it); }
        if (it) { addExtra(it); closeSheet(); render(); }
      }
    } else if (sheetCtx.type === 'swap') {
      if (ds.swpick) applySwap(ds.swpick);
      else if (ds.swreset) {
        const t = todayInfo();
        const sw = { ...(t.log.swaps[t.sid] || {}) }; delete sw[sheetCtx.key]; t.log.swaps[t.sid] = sw;
        delete t.log.sx[`${t.sid}:${sheetCtx.key}`]; delete t.log.sets[`${t.sid}:${sheetCtx.key}`];
        snapshot(t.date, t.log); save(); closeSheet(); render(); toast('已恢复推荐动作');
      }
    } else if (sheetCtx.type === 'rest' && ds.reststep) {
      const cur = state.restPref[sheetCtx.rk] || sheetCtx.cur;
      const next = Math.min(600, Math.max(15, cur + Number(ds.reststep)));
      state.restPref[sheetCtx.rk] = next; sheetCtx.cur = next;
      save(); render();
      $('#sheet .rest-step b').textContent = fmtRest(next);
      document.querySelectorAll('#sheet [data-restset]').forEach((c) => c.classList.toggle('on', Number(c.dataset.restset) === next));
    } else if (sheetCtx.type === 'rest' && ds.restset) {
      state.restPref[sheetCtx.rk] = Number(ds.restset);
      save(); closeSheet(); render();
    }
  });
  $('#sheet').addEventListener('input', (e) => {
    if (e.target.id === 'swSearch' && sheetCtx && sheetCtx.type === 'swap') { swapQ = e.target.value; $('#swList').innerHTML = swapListHtml(sheetCtx.key); return; }
    if (e.target.id !== 'pxSearch' || !sheetCtx || sheetCtx.type !== 'pickex') return;
    pick.q = e.target.value;
    $('#pxList').innerHTML = pickListHtml();
  });
  bindRestDrag();
  $('#rest').addEventListener('click', (e) => {
    if (!restTimer) return;
    if (restMode === 'mini') { if (!$('#rest').dataset.dragged) { restMini = false; drawRest(); } return; }
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.restMin !== undefined) { restMini = true; drawRest(); }
    else if (b.dataset.restSkip !== undefined) stopRest();
    else if (b.dataset.restAdd) {
      const sec = Number(b.dataset.restAdd);
      restTimer.end += sec * 1000;
      restTimer.total = Math.max(1, restTimer.total + sec);
      if (restTimer.end <= Date.now()) { stopRest(); return toast('⏰ 休息结束，开始下一组'); }
      drawRest();
    }
  });
}
