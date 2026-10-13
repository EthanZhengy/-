'use strict';
/* UI: onboarding questionnaire, today / plan / nutrition / me views, reminders. Depends on data.js + engine.js. */

const STORAGE_KEY = 'trainer-531-v2';
const ALL_EQUIP = Object.keys(EQUIPMENT);
const GYM_EQUIP = ALL_EQUIP.filter((e) => e !== 'ssb');
const HOME_EQUIP = ['barbell', 'rack', 'bench', 'dumbbell', 'pullup', 'band'];

function defaultState() {
  return {
    onboarded: false,
    profile: { name: '', sex: 'male', age: 25, height: 175, weight: 70, activity: 1.35, goal: 'bulk' },
    lifts: {
      press: { variant: 'ohp', oneRM: 0 }, deadlift: { variant: 'conv_dl', oneRM: 0 },
      bench: { variant: 'bb_bench', oneRM: 0 }, squat: { variant: 'bb_squat', oneRM: 0 },
    },
    plateInc: 2.5,
    equipment: GYM_EQUIP.slice(),
    injuries: [], favorites: [], excluded: [], customEx: [],
    schedule: [0, 1, 3, 4],
    trainTime: '18:30',
    startDate: dateKey(mondayOf(new Date())),
    tests: {}, logs: {},
    reminders: { enabled: false, morning: '07:30', meals: false },
  };
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!s) return defaultState();
    const d = defaultState();
    return { ...d, ...s, profile: { ...d.profile, ...s.profile }, lifts: { ...d.lifts, ...s.lifts }, reminders: { ...d.reminders, ...s.reminders } };
  } catch { return defaultState(); }
}
let state = loadState();
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}
function logFor(key) {
  if (!state.logs[key]) state.logs[key] = { sets: {}, amrap: {}, swaps: {}, meals: {}, water: 0 };
  const l = state.logs[key];
  l.sets = l.sets || {}; l.amrap = l.amrap || {}; l.swaps = l.swaps || {}; l.meals = l.meals || {};
  return l;
}
const sessionName = (s, week) => (s === 'rest' ? '休息' : week === 12 ? `${LIFT_NAMES[s]}测试` : SESSION_LABEL[s]);
const chip = (label, attrs, on, extra = '') => `<button class="chip${on ? ' on' : ''}${extra}" ${attrs}>${label}</button>`;
function macrosHtml(n) {
  return `<div class="macros">
    <div class="macro"><b>${n.kcal}</b><span class="muted">千卡</span></div>
    <div class="macro p"><b>${n.protein}g</b><span class="muted">蛋白质</span></div>
    <div class="macro c"><b>${n.carbs}g</b><span class="muted">碳水</span></div>
    <div class="macro f"><b>${n.fat}g</b><span class="muted">脂肪</span></div></div>`;
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ================= Onboarding questionnaire ================= */

const STEPS = ['欢迎', '基础信息', '身体与器械', '主项与最大重量', '训练安排与偏好', '你的计划'];
let wiz = null;

function startWizard(fromSettings) {
  const draft = clone(state);
  const inputs = {};
  LIFTS.forEach((l) => (inputs[l] = { w: draft.lifts[l].oneRM || '', reps: 1 }));
  wiz = { step: fromSettings ? 1 : 0, draft, inputs, startOpt: state.onboarded ? 'keep' : 'this', startWeek: 1 };
  render();
}

function variantOK(d, v) { return v.eq.every((t) => d.equipment.includes(t)); }
function bestVariant(d, lift) {
  const ok = VARIANTS[lift].filter((v) => variantOK(d, v));
  const safe = ok.filter((v) => !v.avoid.some((i) => d.injuries.includes(i)));
  return safe.find((v) => (v.fix || []).some((i) => d.injuries.includes(i))) || safe[0] || ok[0] || VARIANTS[lift][0];
}
function fixVariants(d) {
  LIFTS.forEach((l) => {
    const v = VARIANTS[l].find((x) => x.id === d.lifts[l].variant);
    if (!v || !variantOK(d, v) || v.avoid.some((i) => d.injuries.includes(i))) d.lifts[l].variant = bestVariant(d, l).id;
  });
}

function renderWizard() {
  const d = wiz.draft;
  const p = d.profile;
  const sel = (v, cur) => (String(v) === String(cur) ? 'selected' : '');
  let body = '';
  switch (wiz.step) {
    case 0:
      body = `<div class="hero-big">🏋️</div>
        <h2>欢迎使用 5/3/1 训练助手</h2>
        <p>回答几个问题（约 2 分钟），我会根据你的身体数据、最大重量、伤病和器械情况，生成：</p>
        <ul class="tips"><li>12 周 5/3/1 力量计划，每一组都算好具体重量</li>
        <li>每天适合你的拉类、核心和辅助动作（自动避开你做不了的动作）</li>
        <li>训练日 / 休息日的营养目标和餐次安排</li></ul>
        <p class="muted">每天你还可以告诉我「今天想练什么」和「今天状态如何」，计划会自动调整。</p>`;
      break;
    case 1:
      body = `<h2>基础信息</h2><p class="muted">用于计算你的热量和营养需求。</p>
        <label>怎么称呼你（可选）</label><input data-p="name" value="${esc(p.name)}" placeholder="昵称">
        <div class="grid2">
          <div><label>性别</label><select data-p="sex"><option value="male" ${sel('male', p.sex)}>男</option><option value="female" ${sel('female', p.sex)}>女</option></select></div>
          <div><label>年龄</label><input type="number" inputmode="numeric" data-p="age" value="${p.age}"></div>
          <div><label>身高 (cm)</label><input type="number" inputmode="decimal" data-p="height" value="${p.height}"></div>
          <div><label>体重 (kg)</label><input type="number" inputmode="decimal" step="0.1" data-p="weight" value="${p.weight}"></div>
        </div>
        <label>日常活动量（不含训练）</label>
        <select data-p="activity">
          <option value="1.2" ${sel(1.2, p.activity)}>久坐（办公室、学生）</option>
          <option value="1.35" ${sel(1.35, p.activity)}>轻度活动（经常走动）</option>
          <option value="1.5" ${sel(1.5, p.activity)}>中度活动（体力工作）</option>
        </select>
        <label>目前的目标</label>
        <div class="chips">${Object.entries(GOALS).map(([k, g]) => chip(g.label, `data-goal="${k}"`, p.goal === k)).join('')}</div>`;
      break;
    case 2:
      body = `<h2>身体情况与器械</h2>
        <label>有没有伤病或不舒服的部位？（可多选，没有就跳过）</label>
        <div class="chips">${Object.entries(INJURIES).map(([k, n]) => chip(n, `data-injury="${k}"`, d.injuries.includes(k))).join('')}</div>
        <p class="muted">我会自动替换会加重这些部位的动作，比如腰不好会把传统硬拉换成六角杠铃硬拉，并去掉杠铃划船、早安式。</p>
        <label>在哪里训练？</label>
        <div class="chips">${chip('商业健身房', 'data-equipmode="gym"', false)}${chip('家里 / 小型健身房', 'data-equipmode="home"', false)}</div>
        <label>你能用到的器械（点击切换）</label>
        <div class="chips">${Object.entries(EQUIPMENT).map(([k, n]) => chip(n, `data-equip="${k}"`, d.equipment.includes(k))).join('')}</div>`;
      break;
    case 3:
      body = `<h2>主项动作与最大重量</h2>
        <p class="muted">填你<b>最近能做到的重量和次数</b>：做过 1 次极限就填次数 1；不知道极限，填一个你能做 3–5 次的重量也行，我会估算 1RM。训练最大重量 TM = 1RM × 90%。</p>
        ${LIFTS.map((l) => {
          const cur = d.lifts[l];
          const best = bestVariant(d, l).id;
          const opts = VARIANTS[l].map((v) => {
            const ok = variantOK(d, v);
            const bad = v.avoid.filter((i) => d.injuries.includes(i)).map((i) => INJURIES[i]);
            const tag = !ok ? '（缺器械）' : v.id === best ? '（推荐）' : bad.length ? `（不适合${bad.join('、')}）` : '';
            return `<option value="${v.id}" ${cur.variant === v.id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${v.name}${tag}</option>`;
          }).join('');
          const inp = wiz.inputs[l];
          const tm = cur.oneRM ? fmtW(roundTo(cur.oneRM * 0.9, 0.5)) : '—';
          return `<div class="lift-card">
            <div class="row between"><b>${LIFT_NAMES[l]}</b><span class="muted">1RM ${cur.oneRM ? fmtW(cur.oneRM) : '—'}kg · TM ${tm}kg</span></div>
            <select data-variant="${l}">${opts}</select>
            <div class="grid2"><div><label>重量 (kg)</label><input type="number" inputmode="decimal" step="0.5" data-liftw="${l}" value="${esc(inp.w)}" placeholder="例如 100"></div>
            <div><label>能做几次</label><input type="number" inputmode="numeric" min="1" max="12" data-liftr="${l}" value="${esc(inp.reps)}"></div></div>
          </div>`;
        }).join('')}
        <label>最小加重单位（杠铃片）</label>
        <div class="chips">${[1.25, 2.5, 5].map((v) => chip(`${v}kg`, `data-plate="${v}"`, d.plateInc === v)).join('')}</div>`;
      break;
    case 4: {
      const order = SESSION_ORDER.map((s) => SESSION_LABEL[s]);
      const sortedDays = d.schedule.slice().sort((a, b) => a - b);
      body = `<h2>训练安排与偏好</h2>
        <label>每周哪 4 天训练？（计划是一周四练）</label>
        <div class="chips">${WEEKDAYS.map((w, i) => chip(w, `data-day="${i}"`, d.schedule.includes(i))).join('')}</div>
        <p class="muted">${sortedDays.length === 4 ? sortedDays.map((x, i) => `${WEEKDAYS[x]} ${order[i]}`).join(' · ') : `已选 ${sortedDays.length} 天，请选 4 天`}</p>
        <label>通常几点开始训练</label><input type="time" data-train-time value="${esc(d.trainTime)}">
        <label>从哪里开始</label>
        <div class="chips">
          ${state.onboarded ? chip('保持当前进度', 'data-start="keep"', wiz.startOpt === 'keep') : ''}
          ${chip('本周开始（第 1 周）', 'data-start="this"', wiz.startOpt === 'this')}
          ${chip('下周一开始', 'data-start="next"', wiz.startOpt === 'next')}
          ${chip('我已经在练了', 'data-start="week"', wiz.startOpt === 'week')}
        </div>
        ${wiz.startOpt === 'week' ? `<label>本周是第几周</label><select data-start-week>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${wiz.startWeek === i + 1 ? 'selected' : ''}>第 ${i + 1} 周 · ${WEEKS[i].name}</option>`).join('')}</select>` : ''}
        <h3>你的动作偏好</h3>
        <p class="muted">点一次 = ❤️ 喜欢（会优先、经常安排），点两次 = 🚫 不做，再点恢复。已经自动隐藏了你的器械做不了或伤病不适合的动作。</p>
        ${['pull', 'core', 'upper', 'lower'].map((slot) => {
          const list = allExercises(d).filter((e) => e.slot === slot && hasEquip(d, e) && !(e.avoid || []).some((i) => d.injuries.includes(i)));
          return `<label>${SLOT_NAMES[slot]}${slot === 'upper' ? '（推举、卧推日）' : slot === 'lower' ? '（硬拉、深蹲日）' : ''}</label>
            <div class="chips">${list.map((e) => {
              const fav = d.favorites.includes(e.id), ex = d.excluded.includes(e.id);
              return chip(`${fav ? '❤️ ' : ex ? '🚫 ' : ''}${esc(e.name)}`, `data-pref="${e.id}"`, fav, ex ? ' off' : '');
            }).join('')}</div>`;
        }).join('')}
        <label>还有其他习惯的动作？手动添加</label>
        <div class="row"><input class="grow" id="customName" placeholder="动作名称，如：器械推胸">
          <select id="customSlot" style="width:auto">${Object.entries(SLOT_NAMES).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
          <button class="btn small" data-add-custom>添加</button></div>`;
      break;
    }
    case 5: {
      const tmp = { ...d, startDate: computeStart() };
      const today = new Date();
      const train = nutritionFor(tmp, 'lower'), up = nutritionFor(tmp, 'upper'), rest = nutritionFor(tmp, 'rest');
      const pos0 = position(tmp, today) || position(tmp, parseKey(tmp.startDate));
      body = `<h2>${p.name ? esc(p.name) + '，' : ''}你的计划已生成 🎉</h2>
        <div class="card"><h3>训练最大重量（TM）</h3>
          <table class="tm"><tr><th></th><th>第1–4周</th><th>第5–8周</th><th>第9–12周</th></tr>
          ${LIFTS.map((l) => `<tr><td>${variantOf(tmp, l).name.replace(/（.*）/, '')}</td>${[1, 5, 9].map((w) => `<td>${fmtW(roundTo(tmFor(tmp, 0, w, l), 0.5))}</td>`).join('')}</tr>`).join('')}</table>
          <p class="muted">${fmtDate(parseKey(tmp.startDate))}开始第 1 周 · 当前第 ${pos0 ? pos0.week : 1} 周「${WEEKS[(pos0 ? pos0.week : 1) - 1].name}」</p></div>
        <div class="card"><h3>本周训练</h3>${weekPreviewHtml(tmp, pos0 ? pos0.weekAbs : 0, true)}</div>
        <div class="card"><h3>每日营养目标</h3>
          <p class="muted">下肢大重量日</p>${macrosHtml(train)}
          <p class="muted">上肢日</p>${macrosHtml(up)}
          <p class="muted">休息日</p>${macrosHtml(rest)}</div>`;
      break;
    }
  }
  const last = wiz.step === STEPS.length - 1;
  $('#view-wizard').innerHTML = `
    <div class="steps">${STEPS.map((s, i) => `<span class="${i <= wiz.step ? 'on' : ''}"></span>`).join('')}</div>
    <div class="wiz-body">${body}</div>
    <div class="wiz-nav">
      ${wiz.step > 0 ? '<button class="btn ghost" data-wiz="back">上一步</button>' : (state.onboarded ? '<button class="btn ghost" data-wiz="cancel">取消</button>' : '<span></span>')}
      <button class="btn" data-wiz="next">${wiz.step === 0 ? '开始' : last ? '开始训练' : '下一步'}</button>
    </div>`;
}

function computeStart() {
  const mon = mondayOf(new Date());
  if (wiz.startOpt === 'keep') return state.startDate;
  if (wiz.startOpt === 'next') return dateKey(addDays(mon, 7));
  if (wiz.startOpt === 'week') return dateKey(addDays(mon, -(wiz.startWeek - 1) * 7));
  return dateKey(mon);
}

function wizardValidate() {
  const d = wiz.draft;
  if (wiz.step === 1) {
    const p = d.profile;
    if (!(p.age > 10 && p.height > 100 && p.weight > 30)) return '请填写正确的年龄、身高和体重';
  }
  if (wiz.step === 3 && LIFTS.some((l) => !(d.lifts[l].oneRM > 0))) return '请填写四个主项的重量';
  if (wiz.step === 4 && d.schedule.length !== 4) return '请选择 4 个训练日';
  return null;
}

function bindWizard() {
  const root = $('#view-wizard');
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !wiz) return;
    const d = wiz.draft;
    const ds = t.dataset;
    if (ds.wiz === 'back') wiz.step--;
    else if (ds.wiz === 'cancel') { wiz = null; render(); return; }
    else if (ds.wiz === 'next') {
      const err = wizardValidate();
      if (err) return toast(err);
      if (wiz.step === 2) fixVariants(d);
      if (wiz.step === STEPS.length - 1) return finishWizard();
      wiz.step++;
      window.scrollTo(0, 0);
    } else if (ds.goal) d.profile.goal = ds.goal;
    else if (ds.injury) toggle(d.injuries, ds.injury);
    else if (ds.equipmode) d.equipment = (ds.equipmode === 'gym' ? GYM_EQUIP : HOME_EQUIP).slice();
    else if (ds.equip) toggle(d.equipment, ds.equip);
    else if (ds.plate) d.plateInc = Number(ds.plate);
    else if (ds.day !== undefined) {
      const i = Number(ds.day);
      if (d.schedule.includes(i)) toggle(d.schedule, i);
      else if (d.schedule.length < 4) d.schedule.push(i);
      else return toast('最多 4 天，先取消一天');
      d.schedule.sort((a, b) => a - b);
    } else if (ds.start) wiz.startOpt = ds.start;
    else if (ds.pref) {
      const id = ds.pref;
      if (d.favorites.includes(id)) { toggle(d.favorites, id); d.excluded.push(id); }
      else if (d.excluded.includes(id)) toggle(d.excluded, id);
      else d.favorites.push(id);
    } else if (ds.addCustom !== undefined) {
      const name = $('#customName').value.trim();
      if (!name) return toast('请输入动作名称');
      const slot = $('#customSlot').value;
      const id = `custom_${Date.now()}`;
      d.customEx.push({ id, name, slot, m: 'custom', eq: [], reps: slot === 'core' ? '10-20' : '10-15' });
      d.favorites.push(id);
    } else return;
    render();
  });
  root.addEventListener('input', (e) => {
    if (!wiz) return;
    const t = e.target, d = wiz.draft;
    if (t.dataset.p) d.profile[t.dataset.p] = t.dataset.p === 'name' || t.dataset.p === 'sex' ? t.value : Number(t.value);
    else if (t.dataset.liftw || t.dataset.liftr) {
      const l = t.dataset.liftw || t.dataset.liftr;
      const inp = wiz.inputs[l];
      if (t.dataset.liftw) inp.w = t.value; else inp.reps = t.value;
      const w = Number(inp.w), r = Math.max(1, Math.min(12, Number(inp.reps) || 1));
      d.lifts[l].oneRM = w > 0 ? Math.round(epley(w, r) * 2) / 2 : 0;
      const card = t.closest('.lift-card');
      card.querySelector('.muted').textContent = `1RM ${d.lifts[l].oneRM ? fmtW(d.lifts[l].oneRM) : '—'}kg · TM ${d.lifts[l].oneRM ? fmtW(roundTo(d.lifts[l].oneRM * 0.9, 0.5)) : '—'}kg`;
    } else if (t.dataset.trainTime !== undefined) d.trainTime = t.value || d.trainTime;
  });
  root.addEventListener('change', (e) => {
    if (!wiz) return;
    const t = e.target, d = wiz.draft;
    if (t.dataset.variant) {
      const l = t.dataset.variant;
      if (d.lifts[l].variant !== t.value) {
        d.lifts[l].variant = t.value;
        toast(`换了动作，请填写${VARIANTS[l].find((v) => v.id === t.value).name}的重量`);
        d.lifts[l].oneRM = 0; wiz.inputs[l] = { w: '', reps: 1 };
        render();
      }
    } else if (t.dataset.startWeek !== undefined) { wiz.startWeek = Number(t.value); }
    else if (t.dataset.p === 'sex' || t.dataset.p === 'activity') { d.profile[t.dataset.p] = t.dataset.p === 'sex' ? t.value : Number(t.value); }
  });
}
function toggle(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }

function finishWizard() {
  const d = wiz.draft;
  const newStart = computeStart();
  if (newStart !== state.startDate) d.tests = {};
  d.startDate = newStart;
  d.onboarded = true;
  d.logs = state.logs;
  state = d;
  wiz = null;
  save();
  currentView = 'today';
  scheduleReminders();
  render();
  toast('计划已生成，开始训练吧！');
}

/* ================= Today ================= */

let currentView = 'today';

function renderToday() {
  const today = new Date();
  const key = dateKey(today);
  const pos = position(state, today);
  if (!pos) {
    const n = nutritionFor(state, 'rest');
    $('#view-today').innerHTML = `<div class="card hero"><div class="muted">计划还没开始</div>
      <h2>${fmtDate(parseKey(state.startDate))}开始第 1 周</h2>
      <button class="btn light" data-act="start-now">现在就开始</button></div>${nutritionCard(n, logFor(key))}`;
    return;
  }
  const W = WEEKS[pos.week - 1];
  const log = logFor(key);
  const rec = recommend(state, today);
  const sid = log.session || rec.session;
  const readiness = log.readiness || 'normal';
  const order = orderFor(pos.week);
  const done = doneSessions(state, pos, key);
  const doneToday = log.done && log.session === sid;

  const statusChips = order.map((s, i) => {
    const isDone = done.includes(s) || (doneToday && s === sid);
    const opt = pos.week === 12 && i === 3;
    return `<span class="pill${isDone ? ' done' : ''}">${isDone ? '✓ ' : ''}${sessionName(s, pos.week)}${opt ? '(可选)' : ''}</span>`;
  }).join('');

  let html = `<div class="card hero">
    <div class="row between"><span class="tag">第 ${pos.cycle + 1} 轮 · 第 ${pos.week}/12 周</span><span class="muted">${WEEKDAYS[weekdayIdx(today)]}</span></div>
    <h2>${esc(W.name)}</h2>
    <div class="pills">${statusChips}</div></div>`;

  // What to train today
  const yesterday = doneOn(state, addDays(today, -1));
  let warn = '';
  if (log.session && log.session !== rec.session) {
    if (sid !== 'rest' && done.includes(sid)) warn = `${sessionName(sid, pos.week)}本周已经练过，这次算加练。`;
    else if (sid !== 'rest' && yesterday && LOWER[yesterday] && LOWER[sid]) warn = `昨天刚练${LIFT_NAMES[yesterday]}，连续两天练下肢恢复不足，建议选「疲劳」模式或换上肢日。`;
  }
  html += `<div class="card"><h2>今天想练什么？</h2>
    <div class="chips">${order.map((s) => chip(`${sessionName(s, pos.week)}${s === rec.session ? ' ⭐' : ''}${done.includes(s) ? ' ✓' : ''}`, `data-pick="${s}"`, sid === s)).join('')}
    ${chip(`休息${rec.session === 'rest' ? ' ⭐' : ''}`, 'data-pick="rest"', sid === 'rest')}</div>
    <p class="muted">⭐ 推荐：${esc(rec.reason)}</p>
    ${warn ? `<p class="warn">⚠️ ${esc(warn)}</p>` : ''}
    ${sid !== 'rest' ? `<label>今天状态</label><div class="chips">${Object.entries(READINESS).map(([k, r]) => chip(r.label, `data-ready="${k}"`, readiness === k)).join('')}</div>` : ''}
  </div>`;

  let kind = 'rest';
  if (sid !== 'rest') {
    const s = buildSession(state, today, sid, { readiness, swaps: log.swaps[sid] || {} });
    kind = s.kind;
    html += workoutHtml(s, log, sid, doneToday);
  } else {
    html += `<div class="card"><h2>休息日 🧘</h2><ul class="tips">
      <li>轻松散步 20–40 分钟，促进恢复</li><li>髋、胸椎、肩部拉伸 10 分钟</li><li>早点睡，睡眠是最好的恢复</li></ul></div>`;
  }

  // Rest of the week
  const rp = remainingPlan(state, today, sid);
  if (rp.plan.length || rp.unplaced.length) {
    html += `<div class="card"><h2>本周剩余安排</h2>
      ${rp.plan.map((p) => `<div class="row between line"><span>${WEEKDAYS[weekdayIdx(p.date)]} ${fmtDate(p.date)}</span><b>${sessionName(p.session, pos.week)}</b></div>`).join('')}
      ${rp.unplaced.length ? `<p class="warn">本周可能练不完：${rp.unplaced.map((s) => sessionName(s, pos.week)).join('、')}。可以在「计划」里把整个计划顺延一周。</p>` : ''}
      <p class="muted">根据你实际练了什么自动调整，并尽量避免连续两天练下肢。</p></div>`;
  }

  html += nutritionCard(nutritionFor(state, kind), log);
  $('#view-today').innerHTML = html;
}

function workoutHtml(s, log, sid, doneToday) {
  const key = (k) => `${sid}:${k}`;
  let html = `<div class="card"><div class="row between"><h2>${s.test ? '极限测试' : '今日训练'}</h2>${doneToday ? '<span class="tag">✓ 已完成</span>' : ''}</div>`;
  if (s.notes.length) html += `<ul class="notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  s.blocks.forEach((b) => {
    const ticks = log.sets[key(b.key)] || [];
    html += `<div class="block"><div class="row between"><b>${esc(b.title)}</b>
      ${b.ex ? `<button class="btn tiny ghost" data-swap="${b.key}" data-slot="${b.slot}">换一个</button>` : `<span class="muted">${esc(b.sub || '')}</span>`}</div>`;
    if (b.type === 'main') {
      b.rows.forEach((r, i) => {
        const am = log.amrap[`${key(b.key)}:${i}`];
        html += `<div class="setrow${ticks[i] ? ' done' : ''}">
          <button class="tick" data-tick="${b.key}" data-i="${i}">${ticks[i] ? '✓' : i + 1}</button>
          <div class="grow"><span class="muted">${r.label ? esc(r.label) + ' · ' : r.extra ? '单次组 · ' : ''}${r.pct}%</span>
            <div><b class="w">${fmtW(r.w)}kg</b> × ${r.reps}${r.plus ? '<b class="plus">+</b>' : ''}</div></div>
          ${r.plus ? `<input class="amrap" type="number" inputmode="numeric" placeholder="次数" data-amrap="${b.key}" data-i="${i}" value="${am ?? ''}">` : ''}
        </div>
        ${r.plus && am ? `<div class="muted e1rm">估算 1RM ≈ ${fmtW(Math.round(epley(r.w, Number(am)) * 2) / 2)}kg</div>` : ''}`;
      });
      if (b.test) {
        const val = state.tests[s.pos.cycle] && state.tests[s.pos.cycle][b.lift];
        html += `<label>测得的新 1RM (kg)</label><input type="number" inputmode="decimal" step="0.5" data-test="${b.lift}" value="${val ?? ''}" placeholder="最后一次标准完成的重量">
          <p class="muted">填写后，下一轮的 TM 会按新 1RM × 90% 自动计算。</p>`;
      }
    } else {
      html += `<div class="muted">${b.w ? `<b class="w">${fmtW(b.w)}kg</b> × ` : ''}${esc(b.reps)} 次 × ${b.sets} 组</div>
        <div class="sets">${Array.from({ length: b.sets }, (_, i) => `<button class="set-btn${ticks[i] ? ' done' : ''}" data-tick="${b.key}" data-i="${i}">${ticks[i] ? '✓' : i + 1}</button>`).join('')}</div>`;
    }
    html += '</div>';
  });
  html += doneToday
    ? '<button class="btn ghost block" data-act="undo-done">撤销完成</button>'
    : '<button class="btn block" data-act="done">✅ 完成今天的训练</button>';
  return html + '</div>';
}

function nutritionCard(n, log) {
  const meals = mealsFor(state, n);
  const cups = Math.ceil(n.water / 250);
  const label = { lower: '下肢大重量日', upper: '上肢日', rest: '休息日' }[n.kind];
  return `<div class="card">
    <div class="row between"><h2>今日营养</h2><span class="tag">${label} · ${n.goal.label}</span></div>
    ${macrosHtml(n)}
    <h3>餐次安排</h3>
    ${meals.map((m) => `<label class="meal"><input type="checkbox" data-meal="${m.key}" ${log.meals[m.key] ? 'checked' : ''}>
      <div class="grow"><div class="row between"><b>${m.name}</b><span class="muted">${m.time}</span></div>
      <div class="muted">≈${m.kcal}kcal · 蛋白 ${m.protein}g · 碳水 ${m.carbs}g · 脂肪 ${m.fat}g</div>
      <div class="food">${m.food}</div></div></label>`).join('')}
    <h3>喝水 <span class="muted">${log.water * 250}/${n.water}ml</span></h3>
    <div class="row"><div class="water grow">${Array.from({ length: cups }, (_, i) => `<span class="${i < log.water ? 'full' : ''}"></span>`).join('')}</div>
      <button class="btn small ghost" data-water="-1">−</button><button class="btn small" data-water="1">+250ml</button></div>
  </div>`;
}

function bindToday() {
  const root = $('#view-today');
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const today = new Date();
    const key = dateKey(today);
    const log = logFor(key);
    const rec = recommend(state, today);
    const sid = log.session || rec.session;
    const ds = t.dataset;
    if (ds.pick) {
      if (log.done && ds.pick !== log.session) return toast('今天已标记完成，先撤销再换');
      log.session = ds.pick;
    } else if (ds.ready) log.readiness = ds.ready;
    else if (ds.tick) {
      const k = `${sid}:${ds.tick}`;
      log.sets[k] = log.sets[k] || [];
      log.sets[k][ds.i] = !log.sets[k][ds.i];
    } else if (ds.swap) {
      const s = buildSession(state, today, sid, { readiness: log.readiness, swaps: log.swaps[sid] || {} });
      const cur = s.blocks.find((b) => b.key === ds.swap);
      const usedIds = s.blocks.filter((b) => b.ex && b.key !== ds.swap).map((b) => b.ex.id);
      const list = ranked(state, ds.slot, sid, today).map((x) => x.e).filter((x) => !usedIds.includes(x.id));
      if (list.length < 2) return toast('没有其他可替换的动作了');
      const next = list[(list.findIndex((x) => x.id === cur.ex.id) + 1) % list.length];
      log.swaps[sid] = { ...(log.swaps[sid] || {}), [ds.swap]: next.id };
      toast(`已换成：${next.name}`);
    } else if (ds.act === 'done') {
      log.session = sid; log.done = true;
      toast(sid === 'rest' ? '好好休息！' : '💪 训练完成！记得吃练后餐');
    } else if (ds.act === 'undo-done') log.done = false;
    else if (ds.act === 'start-now') state.startDate = dateKey(mondayOf(today));
    else if (ds.water) log.water = Math.max(0, log.water + Number(ds.water));
    else return;
    save(); render();
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    const today = new Date();
    const log = logFor(dateKey(today));
    const sid = log.session || recommend(state, today).session;
    if (t.dataset.meal) log.meals[t.dataset.meal] = t.checked;
    else if (t.dataset.amrap) { log.amrap[`${sid}:${t.dataset.amrap}:${t.dataset.i}`] = t.value ? Number(t.value) : undefined; save(); render(); return; }
    else if (t.dataset.test) {
      const pos = position(state, today);
      state.tests[pos.cycle] = { ...(state.tests[pos.cycle] || {}), [t.dataset.test]: Number(t.value) || undefined };
      toast('已记录，下一轮计划会自动更新');
    } else return;
    save();
  });
}

/* ================= Plan ================= */

function weekPreviewHtml(st, weekAbs, compact) {
  const week = (weekAbs % 12) + 1;
  const start = addDays(parseKey(st.startDate), weekAbs * 7);
  return orderFor(week).map((sid, i) => {
    const date = addDays(start, st.schedule[i] ?? i);
    const s = buildSession(st, date, sid, {});
    if (!s) return '';
    const lines = s.blocks.map((b) => {
      if (b.type === 'main') return `<div><b>${esc(b.title.replace(/^主项 · /, ''))}</b> ${b.rows.filter((r) => !r.label || !r.label.startsWith('热身')).map((r) => `${fmtW(r.w)}×${r.reps}${r.plus ? '+' : ''}`).join(' · ')}</div>`;
      if (compact) return '';
      return `<div class="muted">${esc(b.title)}${b.w ? ` ${fmtW(b.w)}kg` : ''} ${b.sets}×${esc(b.reps)}</div>`;
    }).join('');
    return `<div class="preview"><div class="row between"><span class="tag">${sessionName(sid, week)}</span><span class="muted">${WEEKDAYS[weekdayIdx(date)]} ${fmtDate(date)}</span></div>${lines}</div>`;
  }).join('');
}

function renderPlan() {
  const today = new Date();
  const pos = position(state, today);
  const cycle = pos ? pos.cycle : 0;
  let html = `<div class="card"><h2>训练最大重量 TM（第 ${cycle + 1} 轮）</h2>
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
    html += `<details class="card week"${isCur ? ' open' : ''}><summary><b>第 ${w + 1} 周</b> ${esc(WEEKS[w].name)}
      <span class="muted">${fmtDate(start)}起${isCur ? ' · 本周' : ''}</span></summary>${weekPreviewHtml(state, weekAbs, false)}</details>`;
  }
  $('#view-plan').innerHTML = html;
}
function bindPlan() {
  $('#view-plan').addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.act;
    if (a === 'edit') startWizard(true);
    else if (a === 'postpone' && confirm('把整个计划往后推一周？（本周重新按当前这一周的内容练）')) { state.startDate = dateKey(addDays(parseKey(state.startDate), 7)); save(); render(); toast('已顺延一周'); }
    else if (a === 'advance' && confirm('把计划往前调一周？（相当于跳到下一周）')) { state.startDate = dateKey(addDays(parseKey(state.startDate), -7)); save(); render(); }
  });
}

/* ================= Nutrition ================= */

function renderNutrition() {
  const p = state.profile;
  const sel = (v, cur) => (String(v) === String(cur) ? 'selected' : '');
  const today = new Date();
  const log = logFor(dateKey(today));
  const sid = log.session || recommend(state, today).session;
  const kind = sid === 'rest' || !position(state, today) ? 'rest' : LOWER[sid] ? 'lower' : 'upper';
  const kinds = [['lower', '下肢大重量日（硬拉 / 深蹲）'], ['upper', '上肢日（推举 / 卧推）'], ['rest', '休息日']];
  $('#view-nutrition').innerHTML = `
    ${kinds.map(([k, label]) => { const n = nutritionFor(state, k); return `<div class="card"><div class="row between"><h2>${label}</h2>${k === kind ? '<span class="tag">今天</span>' : ''}</div>${macrosHtml(n)}<p class="muted">饮水 ${n.water}ml</p></div>`; }).join('')}
    <div class="card"><h2>今日建议</h2><ul class="tips">${nutritionTips(nutritionFor(state, kind)).map((t) => `<li>${t}</li>`).join('')}</ul></div>
    <div class="card"><h2>身体数据</h2>
      <div class="grid2">
        <div><label>体重 (kg)</label><input type="number" step="0.1" data-profile="weight" value="${p.weight}"></div>
        <div><label>年龄</label><input type="number" data-profile="age" value="${p.age}"></div>
        <div><label>身高 (cm)</label><input type="number" data-profile="height" value="${p.height}"></div>
        <div><label>活动量</label><select data-profile="activity">
          <option value="1.2" ${sel(1.2, p.activity)}>久坐</option><option value="1.35" ${sel(1.35, p.activity)}>轻度活动</option><option value="1.5" ${sel(1.5, p.activity)}>中度活动</option></select></div>
      </div>
      <label>目标</label><div class="chips">${Object.entries(GOALS).map(([k, g]) => chip(g.label, `data-goal="${k}"`, p.goal === k)).join('')}</div>
      <p class="muted">体重变了记得更新，营养目标会自动重算。数值依据 Mifflin-St Jeor 公式估算，按每周体重变化微调 ±100–200 千卡。</p></div>`;
}
function bindNutrition() {
  const root = $('#view-nutrition');
  root.addEventListener('change', (e) => {
    const k = e.target.dataset.profile;
    if (!k) return;
    state.profile[k] = Number(e.target.value) || state.profile[k];
    save(); render();
  });
  root.addEventListener('click', (e) => {
    const g = e.target.closest('button')?.dataset.goal;
    if (!g) return;
    state.profile.goal = g; save(); render();
  });
}

/* ================= Me / settings ================= */

function renderSettings() {
  const r = state.reminders;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const permText = { granted: '已允许', denied: '已拒绝（请在浏览器设置中开启）', default: '未授权', unsupported: '此浏览器不支持' }[perm];
  const p = state.profile;
  $('#view-settings').innerHTML = `
    <div class="card"><h2>${p.name ? esc(p.name) : '我的资料'}</h2>
      <p class="muted">${p.sex === 'male' ? '男' : '女'} · ${p.age} 岁 · ${p.height}cm · ${p.weight}kg · ${GOALS[p.goal].label}</p>
      <p class="muted">伤病：${state.injuries.map((i) => INJURIES[i]).join('、') || '无'} · 训练日：${state.schedule.map((d) => WEEKDAYS[d]).join('、')} ${esc(state.trainTime)}</p>
      <p class="muted">喜欢的动作：${state.favorites.map((id) => exById(state, id)?.name).filter(Boolean).map(esc).join('、') || '未设置'}</p>
      <button class="btn block" data-act="edit">重新填写问卷（修改身体数据、最大重量、伤病、器械、偏好）</button></div>
    <div class="card"><h2>提醒</h2>
      <label class="row check"><input type="checkbox" data-rem="enabled" ${r.enabled ? 'checked' : ''}> 开启应用内通知</label>
      <p class="muted">通知权限：${permText}</p>
      <label>每天早上提醒时间（今天练什么、多重、吃多少）</label><input type="time" data-rem="morning" value="${esc(r.morning)}">
      <label class="row check"><input type="checkbox" data-rem="meals" ${r.meals ? 'checked' : ''}> 同时提醒训练前 15 分钟和每一餐</label>
      <button class="btn small ghost block" data-act="test-notify">发送测试通知</button>
      <p class="muted">⚠️ 网页通知只有在 App 打开或在后台时才可靠。想要随时准时提醒，推荐导出到手机日历：</p>
      <button class="btn block" data-act="ics">📅 导出未来 4 周训练到日历 (.ics)</button>
      <p class="muted">每个训练日会带上当天的具体重量。如果临时换了训练日或改了计划，重新导出一次即可。</p></div>
    <div class="card"><h2>数据</h2><p class="muted">所有数据只保存在这台设备的浏览器中。</p>
      <div class="row wrap"><button class="btn small ghost" data-act="export">导出备份</button>
        <button class="btn small ghost" data-act="import">导入备份</button>
        <button class="btn small danger" data-act="reset">清空重来</button></div>
      <input type="file" id="importFile" accept="application/json" hidden></div>
    <div class="card"><h2>安装到手机</h2><p class="muted">iPhone：Safari 打开 → 分享 → 添加到主屏幕。<br>Android：Chrome 打开 → 菜单 → 安装应用。</p></div>`;
}
function bindSettings() {
  const root = $('#view-settings');
  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'importFile') return importJson(t.files[0]);
    const k = t.dataset.rem;
    if (!k) return;
    state.reminders[k] = t.type === 'checkbox' ? t.checked : t.value;
    if (k === 'enabled' && t.checked && !(await requestNotify())) { state.reminders.enabled = false; toast('未获得通知权限'); }
    save(); scheduleReminders(); render();
  });
  root.addEventListener('click', async (e) => {
    const a = e.target.closest('button')?.dataset.act;
    if (a === 'edit') startWizard(true);
    else if (a === 'test-notify') { if (await requestNotify()) { const r = remindersFor(new Date())[0]; notify(r.title, r.body); } else toast('未获得通知权限'); }
    else if (a === 'ics') exportIcs();
    else if (a === 'export') download(`531备份-${dateKey(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
    else if (a === 'import') $('#importFile').click();
    else if (a === 'reset' && confirm('会清空所有数据和训练记录，确定吗？')) { state = defaultState(); save(); render(); }
  });
}
function importJson(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d.lifts || !d.profile) throw new Error();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
      state = loadState(); render(); toast('导入成功');
    } catch { toast('文件格式不正确'); }
  };
  r.readAsText(file);
}

/* ================= Reminders ================= */

function remindersFor(date) {
  const rec = recommend(state, date);
  const log = state.logs[dateKey(date)];
  const sid = (log && log.session) || rec.session;
  const pos = position(state, date);
  const kind = sid === 'rest' || !pos ? 'rest' : LOWER[sid] ? 'lower' : 'upper';
  const n = nutritionFor(state, kind);
  const nut = `营养：${n.kcal}千卡 · 蛋白${n.protein}g · 碳水${n.carbs}g · 脂肪${n.fat}g · 水${n.water}ml`;
  const list = [];
  if (sid === 'rest' || !pos) list.push({ time: state.reminders.morning, title: '今天休息 🧘', body: `${rec.reason}\n${nut}` });
  else {
    list.push({ time: state.reminders.morning, title: `今天练：${sessionName(sid, pos.week)} 💪（第${pos.week}周）`, body: `${sessionSummary(state, date, sid, 'normal')}\n${nut}` });
    if (state.reminders.meals) list.push({ time: fromMin(toMin(state.trainTime) - 15), title: '15 分钟后开始训练', body: sessionName(sid, pos.week) });
  }
  if (state.reminders.meals) mealsFor(state, n).forEach((m) => list.push({ time: m.time, title: `该吃${m.name}了`, body: `${m.food}\n≈蛋白 ${m.protein}g · 碳水 ${m.carbs}g · 脂肪 ${m.fat}g` }));
  return list;
}
async function requestNotify() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}
async function notify(title, body) {
  const opts = { body, icon: 'icons/icon.svg', tag: title };
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) return reg.showNotification(title, opts); } catch { /* fall back */ }
  new Notification(title, opts);
}
let timers = [];
function scheduleReminders() {
  timers.forEach(clearTimeout); timers = [];
  if (!state.onboarded || !state.reminders.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  remindersFor(now).forEach((r) => {
    const delay = (toMin(r.time) - nowMin) * 60000 - now.getSeconds() * 1000;
    if (delay > 0) timers.push(setTimeout(() => notify(r.title, r.body), delay));
  });
  const midnight = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
  timers.push(setTimeout(() => { scheduleReminders(); render(); }, midnight - now + 5000));
}

/** RFC 5545 line folding at 75 UTF-8 bytes. */
function foldLine(line) {
  const enc = new TextEncoder();
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
function exportIcs() {
  const pad = (n) => String(n).padStart(2, '0');
  const ie = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//trainer-531//CN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:5/3/1 训练'];
  const today = new Date();
  for (let i = 0; i < 28; i++) {
    const date = addDays(today, i);
    const pos = position(state, date);
    if (!pos) continue;
    // Future days follow the fixed schedule; today follows what you picked
    const sid = i === 0 ? (state.logs[dateKey(date)]?.session || recommend(state, date).session) : scheduledFor(state, date, pos.week);
    if (!sid || sid === 'rest') continue;
    const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
    const [h, m] = state.trainTime.split(':');
    const end = fromMin(toMin(state.trainTime) + 90).split(':');
    const n = nutritionFor(state, LOWER[sid] ? 'lower' : 'upper');
    const title = `${sessionName(sid, pos.week)}（第${pos.week}周 ${WEEKS[pos.week - 1].name}）`;
    const body = `${sessionSummary(state, date, sid, 'normal')}\n营养：${n.kcal}千卡 · 蛋白${n.protein}g · 碳水${n.carbs}g · 脂肪${n.fat}g`;
    lines.push('BEGIN:VEVENT', `UID:${ymd}-531@trainer`, `DTSTAMP:${stamp}`, `DTSTART:${ymd}T${h}${m}00`,
      toMin(state.trainTime) + 90 < 1440 ? `DTEND:${ymd}T${end[0]}${end[1]}00` : `DTEND:${ymd}T235900`,
      `SUMMARY:${ie(title)}`, `DESCRIPTION:${ie(body)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${ie(title)}`, `TRIGGER:-PT${Math.max(0, toMin(state.trainTime) - toMin(state.reminders.morning))}M`, 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  download(`531训练-${dateKey(today)}.ics`, lines.map(foldLine).join('\r\n'), 'text/calendar');
  toast('已导出，用手机打开文件导入日历');
}

/* ================= Shell ================= */

function render() {
  const inWizard = !state.onboarded || wiz;
  if (!state.onboarded && !wiz) { startWizard(false); return; }
  document.body.classList.toggle('wizard-mode', !!inWizard);
  const titles = { today: '今天', plan: '12 周计划', nutrition: '营养', settings: '我的' };
  $('#pageTitle').textContent = inWizard ? '设置你的计划' : titles[currentView];
  const d = new Date();
  $('#dateLabel').textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[weekdayIdx(d)]}`;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', inWizard ? v.id === 'view-wizard' : v.id === `view-${currentView}`));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === currentView));
  if (inWizard) return renderWizard();
  ({ today: renderToday, plan: renderPlan, nutrition: renderNutrition, settings: renderSettings })[currentView]();
}

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  currentView = b.dataset.view;
  render(); window.scrollTo(0, 0);
});
bindWizard(); bindToday(); bindPlan(); bindNutrition(); bindSettings();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !wiz) { scheduleReminders(); render(); } });
render();
scheduleReminders();
