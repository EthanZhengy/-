'use strict';

/* ================= Data & storage ================= */

const STORAGE_KEY = 'trainer-app-v1';
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const ex = (name, sets, reps, weight = '', note = '') => ({ name, sets, reps, weight, note });

function defaultState() {
  return {
    profile: { sex: 'male', age: 25, height: 175, weight: 70, activity: 1.35, goal: 'bulk' },
    plan: {
      mode: 'weekly', // 'weekly' = fixed Mon–Sun; 'cycle' = N-day rotation from cycleStart
      cycleStart: dateKey(new Date()),
      days: [
        { focus: '推：胸 / 肩 / 三头', rest: false, exercises: [
          ex('杠铃卧推', 4, '6-8'), ex('上斜哑铃卧推', 3, '8-10'), ex('坐姿哑铃推举', 3, '8-10'),
          ex('哑铃侧平举', 3, '12-15'), ex('绳索下压', 3, '10-12') ] },
        { focus: '拉：背 / 二头', rest: false, exercises: [
          ex('引体向上', 4, '6-10'), ex('杠铃划船', 4, '8'), ex('高位下拉', 3, '10-12'),
          ex('绳索面拉', 3, '15'), ex('杠铃弯举', 3, '10') ] },
        { focus: '腿：股四 / 臀 / 腘绳', rest: false, exercises: [
          ex('杠铃深蹲', 4, '5-8'), ex('罗马尼亚硬拉', 3, '8'), ex('腿举', 3, '10-12'),
          ex('腿弯举', 3, '12'), ex('站姿提踵', 4, '15') ] },
        { focus: '休息 / 主动恢复', rest: true, exercises: [], note: '散步 30 分钟 + 全身拉伸' },
        { focus: '上肢综合', rest: false, exercises: [
          ex('哑铃卧推', 4, '8-10'), ex('单臂哑铃划船', 4, '10'), ex('阿诺德推举', 3, '10'),
          ex('锤式弯举', 3, '12'), ex('仰卧臂屈伸', 3, '12') ] },
        { focus: '下肢 + 核心', rest: false, exercises: [
          ex('传统硬拉', 3, '5'), ex('保加利亚分腿蹲', 3, '10/腿'), ex('臀推', 3, '10'),
          ex('悬垂举腿', 3, '12'), ex('平板支撑', 3, '60秒') ] },
        { focus: '休息', rest: true, exercises: [], note: '充分休息，保证睡眠' },
      ],
    },
    settings: {
      trainTime: '18:30',
      reminders: false,
      morningTime: '07:30',
      mealReminders: true,
    },
    logs: {},
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const saved = JSON.parse(raw);
    const def = defaultState();
    return {
      ...def, ...saved,
      profile: { ...def.profile, ...saved.profile },
      plan: { ...def.plan, ...saved.plan },
      settings: { ...def.settings, ...saved.settings },
      logs: saved.logs || {},
    };
  } catch {
    return defaultState();
  }
}

let state = loadState();
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

/* ================= Date helpers ================= */

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function dayDiff(a, b) {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}
const weekdayIdx = (d) => (d.getDay() + 6) % 7; // Monday = 0
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

/** Which plan day applies to a given date. */
function planIndexFor(date) {
  const days = state.plan.days;
  if (!days.length) return -1;
  if (state.plan.mode === 'weekly') return weekdayIdx(date);
  const diff = dayDiff(parseKey(state.plan.cycleStart), date);
  return ((diff % days.length) + days.length) % days.length;
}
function planDayFor(date) {
  const i = planIndexFor(date);
  return i < 0 ? { focus: '未设置计划', rest: true, exercises: [] } : state.plan.days[i];
}
function dayLabel(i) {
  return state.plan.mode === 'weekly' ? WEEKDAYS[i] : `第 ${i + 1} 天`;
}

/* ================= Nutrition ================= */

const GOALS = {
  bulk: { label: '增肌', kcal: 250, protein: 2.0, fat: 0.9 },
  cut: { label: '减脂', kcal: -450, protein: 2.2, fat: 0.8 },
  maintain: { label: '维持', kcal: 0, protein: 1.8, fat: 0.9 },
};

/**
 * Daily targets. BMR via Mifflin-St Jeor, × lifestyle activity factor,
 * + estimated workout burn on training days, then goal adjustment.
 * Protein/fat are set per kg bodyweight; carbs fill the remainder, so
 * training days naturally get more carbs than rest days.
 */
function nutritionFor(planDay) {
  const p = state.profile;
  const g = GOALS[p.goal] || GOALS.maintain;
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const training = !planDay.rest;
  const workoutBurn = training ? Math.round(4 * p.weight) : 0; // ~60 min resistance training
  const kcal = Math.round((bmr * p.activity + workoutBurn + g.kcal) / 10) * 10;
  const protein = Math.round(p.weight * g.protein);
  const fat = Math.round(p.weight * (training ? g.fat : g.fat + 0.1));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const water = Math.round((p.weight * 35 + (training ? 600 : 0)) / 100) * 100;
  return { kcal, protein, fat, carbs, water, training, goal: g };
}

function mealsFor(planDay, n) {
  const t = toMin(state.settings.trainTime);
  const meals = planDay.rest
    ? [
        { key: 'b', name: '早餐', time: '07:30', pct: 0.25, food: '燕麦 + 鸡蛋 2–3 个 + 牛奶/豆浆 + 水果' },
        { key: 'l', name: '午餐', time: '12:00', pct: 0.35, food: '米饭/杂粮 + 鸡胸/牛肉/鱼 + 大量蔬菜' },
        { key: 's', name: '下午加餐', time: '15:30', pct: 0.1, food: '希腊酸奶 + 一把坚果' },
        { key: 'd', name: '晚餐', time: '18:30', pct: 0.3, food: '鱼/虾/豆腐 + 蔬菜 + 少量主食，脂肪可略多（橄榄油、牛油果）' },
      ]
    : [
        { key: 'b', name: '早餐', time: '07:30', pct: 0.25, food: '燕麦/全麦面包 + 鸡蛋 2–3 个 + 牛奶' },
        { key: 'l', name: '午餐', time: '12:00', pct: 0.3, food: '米饭/面 + 瘦肉/鸡胸 + 蔬菜' },
        { key: 'pre', name: '练前加餐', time: fromMin(t - 90), pct: 0.15, food: '香蕉 + 面包/米糕 + 少量蛋白（低脂、易消化）' },
        { key: 'post', name: '练后餐', time: fromMin(t + 75), pct: 0.3, food: '蛋白粉/鸡胸/鱼 + 米饭/土豆/面（高碳水 + 高蛋白，低脂）' },
      ];
  return meals
    .map((m) => ({
      ...m,
      protein: Math.round(n.protein * m.pct),
      carbs: Math.round(n.carbs * m.pct),
      fat: Math.round(n.fat * m.pct),
      kcal: Math.round(n.kcal * m.pct),
    }))
    .sort((a, b) => toMin(a.time) - toMin(b.time));
}

function nutritionTips(n) {
  const tips = [];
  if (n.training) {
    tips.push('训练日：碳水集中在练前和练后，帮助训练表现与恢复。');
    tips.push('练后 2 小时内摄入 25–40g 优质蛋白。');
    tips.push(`训练中补水 500ml 左右，全天目标 ${n.water}ml。`);
  } else {
    tips.push('休息日：碳水适当降低，蛋白质保持不变以支持肌肉修复。');
    tips.push('多吃蔬菜和健康脂肪（鱼、坚果、橄榄油）。');
  }
  if (n.goal === GOALS.cut) tips.push('减脂期：优先高饱腹食物（瘦肉、蔬菜、土豆），避免含糖饮料。');
  if (n.goal === GOALS.bulk) tips.push('增肌期：每周体重增长约 0.25–0.5kg 为宜，过快说明热量过高。');
  tips.push('每天睡够 7–9 小时，恢复和训练一样重要。');
  return tips;
}

/* ================= Logs ================= */

function logFor(key) {
  if (!state.logs[key]) state.logs[key] = { sets: {}, meals: {}, water: 0 };
  return state.logs[key];
}
function workoutProgress(planDay, log) {
  let total = 0, done = 0;
  planDay.exercises.forEach((e, i) => {
    const n = Number(e.sets) || 0;
    total += n;
    done += (log.sets[i] || []).slice(0, n).filter(Boolean).length;
  });
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

/* ================= Rendering ================= */

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let currentView = 'today';
let selectedDate = new Date();

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2200);
}

function renderHeader() {
  const titles = { today: '今天', plan: '训练计划', nutrition: '营养', settings: '设置' };
  $('#pageTitle').textContent = titles[currentView];
  const d = new Date();
  $('#dateLabel').textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[weekdayIdx(d)]}`;
}

function renderToday() {
  const today = new Date();
  const key = dateKey(selectedDate);
  const isToday = key === dateKey(today);
  const day = planDayFor(selectedDate);
  const idx = planIndexFor(selectedDate);
  const log = logFor(key);
  const n = nutritionFor(day);
  const prog = workoutProgress(day, log);

  // Upcoming 7-day strip, starting from today
  let strip = '<div class="week-strip">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const pd = planDayFor(d);
    const sel = dateKey(d) === key ? ' sel' : '';
    strip += `<button class="${pd.rest ? 'rest' : ''}${sel}" data-date="${dateKey(d)}">
      <b>${i === 0 ? '今天' : WEEKDAYS[weekdayIdx(d)]}</b>${esc(pd.rest ? '休息' : pd.focus.split(/[：:]/)[0])}</button>`;
  }
  strip += '</div>';

  const when = isToday ? '今天' : `${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日`;
  const hero = `<div class="card hero">
    <div class="row between"><span class="tag">${idx >= 0 ? dayLabel(idx) : ''}</span>
      <span class="muted">${day.rest ? '休息日' : `训练 ${esc(state.settings.trainTime)}`}</span></div>
    <div class="muted" style="margin-top:8px">${when}该练</div>
    <h2>${esc(day.focus)}</h2>
    ${day.rest
      ? `<div class="muted">${esc(day.note || '好好休息，让肌肉生长')}</div>`
      : `<div class="row between muted" style="margin:8px 0 6px"><span>${day.exercises.length} 个动作 · ${prog.total} 组</span><span>${prog.done}/${prog.total}</span></div>
         <div class="progress"><div style="width:${prog.pct}%"></div></div>`}
  </div>`;

  let exercises = '';
  if (!day.rest) {
    exercises = `<div class="card"><h2>今日动作</h2>
      <p class="muted" style="margin:0 0 4px">完成一组就点一下对应的组</p>`;
    day.exercises.forEach((e, i) => {
      const done = log.sets[i] || [];
      let sets = '';
      for (let s = 0; s < (Number(e.sets) || 0); s++) {
        sets += `<button class="set-btn${done[s] ? ' done' : ''}" data-ex="${i}" data-set="${s}">${done[s] ? '✓' : `第${s + 1}组`}</button>`;
      }
      exercises += `<div class="exercise">
        <div class="row between"><span class="name">${esc(e.name)}</span>
          <span class="muted">${esc(e.sets)} 组 × ${esc(e.reps)}${e.weight ? ` · ${esc(e.weight)}` : ''}</span></div>
        ${e.note ? `<div class="muted">${esc(e.note)}</div>` : ''}
        <div class="sets">${sets}</div></div>`;
    });
    if (!day.exercises.length) exercises += '<p class="muted">这一天还没有动作，去「计划」里添加吧。</p>';
    exercises += '</div>';
  }

  const meals = mealsFor(day, n);
  const cups = Math.ceil(n.water / 250);
  let water = '';
  for (let i = 0; i < cups; i++) water += `<span class="${i < log.water ? 'full' : ''}"></span>`;

  const nutrition = `<div class="card">
    <div class="row between"><h2>${when}营养目标</h2><span class="tag">${n.training ? '训练日' : '休息日'} · ${n.goal.label}</span></div>
    ${macrosHtml(n)}
    <h3>餐次安排</h3>
    ${meals.map((m) => `<label class="meal" style="margin:0;color:inherit;font-size:inherit">
      <input type="checkbox" data-meal="${m.key}" ${log.meals[m.key] ? 'checked' : ''}>
      <div class="grow"><div class="row between"><b>${m.name}</b><span class="when">${m.time}</span></div>
        <div class="muted">≈${m.kcal}kcal · 蛋白 ${m.protein}g · 碳水 ${m.carbs}g · 脂肪 ${m.fat}g</div>
        <div style="font-size:14px;margin-top:2px">${m.food}</div></div></label>`).join('')}
    <h3>喝水 <span class="muted">${log.water * 250}/${n.water}ml</span></h3>
    <div class="row"><div class="water grow">${water}</div>
      <button class="btn small ghost" data-water="-1">−</button><button class="btn small" data-water="1">+250ml</button></div>
  </div>`;

  $('#view-today').innerHTML = strip + hero + exercises + nutrition;
}

function macrosHtml(n) {
  return `<div class="macros">
    <div class="macro"><b>${n.kcal}</b><span class="muted">千卡</span></div>
    <div class="macro p"><b>${n.protein}g</b><span class="muted">蛋白质</span></div>
    <div class="macro c"><b>${n.carbs}g</b><span class="muted">碳水</span></div>
    <div class="macro f"><b>${n.fat}g</b><span class="muted">脂肪</span></div></div>`;
}

function renderPlan() {
  const p = state.plan;
  let html = `<div class="card">
    <h2>计划模式</h2>
    <div class="segmented" id="modeSwitch">
      <button data-mode="weekly" class="${p.mode === 'weekly' ? 'on' : ''}">按星期（周一~周日）</button>
      <button data-mode="cycle" class="${p.mode === 'cycle' ? 'on' : ''}">循环（N 天一轮）</button>
    </div>
    ${p.mode === 'cycle' ? `<label>第 1 天对应的日期</label><input type="date" id="cycleStart" value="${esc(p.cycleStart)}">
      <p class="muted">今天是循环的 ${dayLabel(planIndexFor(new Date()))}</p>` : ''}
  </div>`;

  p.days.forEach((d, i) => {
    html += `<div class="card" data-day="${i}">
      <div class="row between"><h2>${dayLabel(i)}</h2>
        <label class="row" style="margin:0"><input type="checkbox" data-field="rest" ${d.rest ? 'checked' : ''}> 休息日</label></div>
      <label>训练内容 / 部位</label>
      <input data-field="focus" value="${esc(d.focus)}" placeholder="如：胸 + 三头">
      ${d.rest
        ? `<label>备注</label><input data-field="note" value="${esc(d.note || '')}" placeholder="如：拉伸、散步">`
        : `<div class="ex-edit ex-head"><span>动作</span><span>组数</span><span>次数</span><span>重量</span><span></span></div>
          ${d.exercises.map((e, j) => `<div class="ex-edit" data-ex="${j}">
            <input data-exfield="name" value="${esc(e.name)}" placeholder="动作名称">
            <input data-exfield="sets" type="number" min="1" max="20" value="${esc(e.sets)}">
            <input data-exfield="reps" value="${esc(e.reps)}" placeholder="8-12">
            <input data-exfield="weight" value="${esc(e.weight)}" placeholder="kg">
            <button class="icon-btn" data-action="del-ex" title="删除">✕</button></div>`).join('')}
          <button class="btn small ghost block" data-action="add-ex">＋ 添加动作</button>`}
      ${p.mode === 'cycle' ? `<button class="btn small danger block" data-action="del-day">删除这一天</button>` : ''}
    </div>`;
  });

  if (p.mode === 'cycle') html += `<button class="btn block" data-action="add-day">＋ 添加一天</button>`;
  html += `<p class="muted" style="text-align:center">修改会自动保存</p>`;
  $('#view-plan').innerHTML = html;
}

function renderNutrition() {
  const p = state.profile;
  const train = nutritionFor({ rest: false });
  const rest = nutritionFor({ rest: true });
  const sel = (v, cur) => (String(v) === String(cur) ? 'selected' : '');
  const day = planDayFor(new Date());
  $('#view-nutrition').innerHTML = `
    <div class="card"><h2>身体数据</h2>
      <div class="grid2">
        <div><label>性别</label><select data-profile="sex"><option value="male" ${sel('male', p.sex)}>男</option><option value="female" ${sel('female', p.sex)}>女</option></select></div>
        <div><label>年龄</label><input type="number" data-profile="age" value="${p.age}"></div>
        <div><label>身高 (cm)</label><input type="number" data-profile="height" value="${p.height}"></div>
        <div><label>体重 (kg)</label><input type="number" step="0.1" data-profile="weight" value="${p.weight}"></div>
      </div>
      <label>日常活动量（不含训练）</label>
      <select data-profile="activity">
        <option value="1.2" ${sel(1.2, p.activity)}>久坐（办公室工作）</option>
        <option value="1.35" ${sel(1.35, p.activity)}>轻度活动（经常走动）</option>
        <option value="1.5" ${sel(1.5, p.activity)}>中度活动（体力工作）</option>
      </select>
      <label>目标</label>
      <div class="segmented" id="goalSwitch">
        ${Object.entries(GOALS).map(([k, g]) => `<button data-goal="${k}" class="${p.goal === k ? 'on' : ''}">${g.label}</button>`).join('')}
      </div>
    </div>
    <div class="card"><div class="row between"><h2>训练日</h2>${!day.rest ? '<span class="tag">今天</span>' : ''}</div>${macrosHtml(train)}
      <p class="muted">饮水 ${train.water}ml</p></div>
    <div class="card"><div class="row between"><h2>休息日</h2>${day.rest ? '<span class="tag">今天</span>' : ''}</div>${macrosHtml(rest)}
      <p class="muted">饮水 ${rest.water}ml</p></div>
    <div class="card"><h2>今日建议</h2><ul class="tips">${nutritionTips(nutritionFor(day)).map((t) => `<li>${t}</li>`).join('')}</ul></div>
    <p class="muted">数值依据 Mifflin-St Jeor 公式估算，仅供参考。根据每周体重变化微调热量（±100–200 千卡）。</p>`;
}

function renderSettings() {
  const s = state.settings;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const permText = { granted: '已允许', denied: '已拒绝（请在浏览器设置中开启）', default: '未授权', unsupported: '此浏览器不支持' }[perm];
  $('#view-settings').innerHTML = `
    <div class="card"><h2>训练时间</h2>
      <label>通常几点开始训练</label><input type="time" data-setting="trainTime" value="${esc(s.trainTime)}">
      <p class="muted">用于安排练前/练后餐的时间。</p></div>
    <div class="card"><h2>提醒</h2>
      <label class="row" style="color:inherit;font-size:15px"><input type="checkbox" data-setting="reminders" ${s.reminders ? 'checked' : ''}> 开启应用内通知</label>
      <p class="muted">通知权限：${permText}</p>
      <label>每日早晨提醒时间（今天练什么 + 营养目标）</label><input type="time" data-setting="morningTime" value="${esc(s.morningTime)}">
      <label class="row" style="color:inherit;font-size:15px"><input type="checkbox" data-setting="mealReminders" ${s.mealReminders ? 'checked' : ''}> 同时提醒训练前 15 分钟和每一餐</label>
      <button class="btn small ghost block" data-action="test-notify">发送测试通知</button>
      <p class="muted">⚠️ 网页通知只在应用保持打开（或在后台未被系统关闭）时可靠。想要<b>任何时候都准时提醒</b>，推荐导出到手机日历：</p>
      <button class="btn block" data-action="export-ics">📅 导出未来 4 周提醒到日历 (.ics)</button>
      <p class="muted">下载后用手机打开该文件即可导入系统日历（iPhone 日历 / Google 日历等），每天早上会自动提醒今天练什么、吃多少。修改计划后重新导出即可。</p>
    </div>
    <div class="card"><h2>数据</h2>
      <p class="muted">所有数据只保存在本机浏览器中。</p>
      <div class="row wrap">
        <button class="btn small ghost" data-action="export-json">导出备份</button>
        <button class="btn small ghost" data-action="import-json">导入备份</button>
        <button class="btn small danger" data-action="reset">恢复默认</button>
      </div>
      <input type="file" id="importFile" accept="application/json" hidden>
    </div>
    <div class="card"><h2>安装到手机</h2>
      <p class="muted">iPhone：Safari 打开 → 分享 → 添加到主屏幕。<br>Android：Chrome 打开 → 菜单 → 安装应用 / 添加到主屏幕。</p></div>`;
}

function render() {
  renderHeader();
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${currentView}`));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === currentView));
  ({ today: renderToday, plan: renderPlan, nutrition: renderNutrition, settings: renderSettings })[currentView]();
}

/* ================= Events ================= */

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  currentView = b.dataset.view;
  if (currentView === 'today') selectedDate = new Date();
  render();
  window.scrollTo(0, 0);
});

// Today view
$('#view-today').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  const log = logFor(dateKey(selectedDate));
  if (t.dataset.date) {
    selectedDate = parseKey(t.dataset.date);
  } else if (t.dataset.ex !== undefined) {
    const i = t.dataset.ex, s = Number(t.dataset.set);
    log.sets[i] = log.sets[i] || [];
    log.sets[i][s] = !log.sets[i][s];
    const day = planDayFor(selectedDate);
    const p = workoutProgress(day, log);
    if (p.total && p.done === p.total && log.sets[i][s]) toast('🎉 今日训练完成！记得吃练后餐');
  } else if (t.dataset.water) {
    log.water = Math.max(0, log.water + Number(t.dataset.water));
  } else return;
  save();
  render();
});
$('#view-today').addEventListener('change', (e) => {
  if (!e.target.dataset.meal) return;
  logFor(dateKey(selectedDate)).meals[e.target.dataset.meal] = e.target.checked;
  save();
});

// Plan view
const planView = $('#view-plan');
planView.addEventListener('input', (e) => {
  const t = e.target;
  const dayEl = t.closest('[data-day]');
  if (t.id === 'cycleStart') { if (t.value) { state.plan.cycleStart = t.value; save(); } return; }
  if (!dayEl) return;
  const day = state.plan.days[dayEl.dataset.day];
  if (t.dataset.field && t.type !== 'checkbox') day[t.dataset.field] = t.value;
  if (t.dataset.exfield) {
    const exItem = day.exercises[t.closest('[data-ex]').dataset.ex];
    exItem[t.dataset.exfield] = t.dataset.exfield === 'sets' ? Math.max(0, Math.min(20, Number(t.value) || 0)) : t.value;
  }
  save();
});
planView.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'cycleStart') { render(); return; }
  if (t.dataset.field === 'rest') {
    state.plan.days[t.closest('[data-day]').dataset.day].rest = t.checked;
    save();
    render();
  }
});
planView.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.mode) {
    if (t.dataset.mode === state.plan.mode) return;
    state.plan.mode = t.dataset.mode;
    if (state.plan.mode === 'weekly') {
      // Weekly mode needs exactly 7 days
      while (state.plan.days.length < 7) state.plan.days.push({ focus: '休息', rest: true, exercises: [] });
      state.plan.days.length = 7;
    }
    save(); render(); return;
  }
  const dayEl = t.closest('[data-day]');
  const action = t.dataset.action;
  if (action === 'add-day') {
    state.plan.days.push({ focus: '新的一天', rest: false, exercises: [ex('', 3, '10')] });
  } else if (dayEl) {
    const i = Number(dayEl.dataset.day);
    const day = state.plan.days[i];
    if (action === 'add-ex') day.exercises.push(ex('', 3, '10'));
    else if (action === 'del-ex') day.exercises.splice(Number(t.closest('[data-ex]').dataset.ex), 1);
    else if (action === 'del-day') {
      if (state.plan.days.length <= 1) return toast('至少保留一天');
      if (!confirm(`删除${dayLabel(i)}？`)) return;
      state.plan.days.splice(i, 1);
    } else return;
  } else return;
  save(); render();
});

// Nutrition view
$('#view-nutrition').addEventListener('change', (e) => {
  const k = e.target.dataset.profile;
  if (!k) return;
  state.profile[k] = k === 'sex' ? e.target.value : Number(e.target.value) || state.profile[k];
  save(); render();
});
$('#view-nutrition').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-goal]');
  if (!b) return;
  state.profile.goal = b.dataset.goal;
  save(); render();
});

// Settings view
const settingsView = $('#view-settings');
settingsView.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'importFile') return importJson(t.files[0]);
  const k = t.dataset.setting;
  if (!k) return;
  state.settings[k] = t.type === 'checkbox' ? t.checked : t.value;
  if (k === 'reminders' && t.checked) {
    const ok = await requestNotify();
    if (!ok) { state.settings.reminders = false; toast('未获得通知权限'); }
  }
  save(); scheduleReminders(); render();
});
settingsView.addEventListener('click', async (e) => {
  const a = e.target.closest('button')?.dataset.action;
  if (a === 'test-notify') {
    if (await requestNotify()) notify('今日训练', morningSummary(new Date())); else toast('未获得通知权限');
  } else if (a === 'export-ics') exportIcs();
  else if (a === 'export-json') download(`训练备份-${dateKey(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
  else if (a === 'import-json') $('#importFile').click();
  else if (a === 'reset') {
    if (confirm('恢复默认会清空你的计划和记录，确定吗？')) { state = defaultState(); save(); render(); toast('已恢复默认'); }
  }
});

function importJson(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data.plan || !Array.isArray(data.plan.days)) throw new Error('bad');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      state = loadState();
      save(); render(); toast('导入成功');
    } catch { toast('文件格式不正确'); }
  };
  r.readAsText(file);
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ================= Reminders ================= */

function morningSummary(date) {
  const d = planDayFor(date);
  const n = nutritionFor(d);
  const work = d.rest
    ? `今天休息：${d.note || d.focus}`
    : `今天练 ${d.focus}（${state.settings.trainTime}）：${d.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join('、')}`;
  return `${work}\n营养：${n.kcal}千卡 · 蛋白${n.protein}g · 碳水${n.carbs}g · 脂肪${n.fat}g · 水${n.water}ml`;
}

async function requestNotify() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

async function notify(title, body) {
  const opts = { body, icon: 'icons/icon.svg', badge: 'icons/icon.svg', tag: title };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, opts);
  } catch { /* fall through */ }
  new Notification(title, opts);
}

/** Today's reminder list: [{time 'HH:MM', title, body}] */
function remindersFor(date) {
  const s = state.settings;
  const d = planDayFor(date);
  const list = [{ time: s.morningTime, title: d.rest ? '今天休息日 🧘' : `今天练：${d.focus} 💪`, body: morningSummary(date) }];
  if (s.mealReminders) {
    if (!d.rest) list.push({ time: fromMin(toMin(s.trainTime) - 15), title: '15 分钟后开始训练', body: `${d.focus}：${d.exercises.map((e) => e.name).join('、')}` });
    mealsFor(d, nutritionFor(d)).forEach((m) =>
      list.push({ time: m.time, title: `该吃${m.name}了`, body: `${m.food}\n≈蛋白 ${m.protein}g · 碳水 ${m.carbs}g · 脂肪 ${m.fat}g` }));
  }
  return list;
}

let timers = [];
function scheduleReminders() {
  timers.forEach(clearTimeout);
  timers = [];
  if (!state.settings.reminders || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  remindersFor(now).forEach((r) => {
    const delay = (toMin(r.time) - nowMin) * 60000 - now.getSeconds() * 1000;
    if (delay > 0) timers.push(setTimeout(() => notify(r.title, r.body), delay));
  });
  // Re-plan just after midnight
  const midnight = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
  timers.push(setTimeout(() => { scheduleReminders(); if (currentView === 'today') { selectedDate = new Date(); render(); } }, midnight - now + 5000));
}

/** Fold iCalendar lines at 75 UTF-8 bytes without splitting a character. */
function foldLine(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '', bytes = 0;
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
  const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//trainer-app//CN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:今日训练'];
  const start = new Date();
  for (let i = 0; i < 28; i++) {
    const date = addDays(start, i);
    const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
    remindersFor(date).forEach((r, j) => {
      const [h, m] = r.time.split(':');
      const end = fromMin(toMin(r.time) + 15).split(':');
      // Avoid wrapping past midnight on the same date
      const endStr = toMin(r.time) + 15 >= 1440 ? `${h}${m}59` : `${end[0]}${end[1]}00`;
      lines.push('BEGIN:VEVENT',
        `UID:${ymd}-${j}-trainer@local`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${ymd}T${h}${m}00`,
        `DTEND:${ymd}T${endStr}`,
        `SUMMARY:${icsEsc(r.title)}`,
        `DESCRIPTION:${icsEsc(r.body)}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(r.title)}`, 'TRIGGER:PT0M', 'END:VALARM',
        'END:VEVENT');
    });
  }
  lines.push('END:VCALENDAR');
  download(`训练提醒-${dateKey(start)}.ics`, lines.map(foldLine).join('\r\n'), 'text/calendar');
  toast('已导出，用手机打开文件导入日历');
}

/* ================= Boot ================= */

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { scheduleReminders(); render(); }
});
render();
scheduleReminders();
