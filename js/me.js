'use strict';
/* ================= 我的: profile, nutrition targets, settings ================= */

function todayKind() {
  const today = new Date();
  const log = logFor(dateKey(today));
  const sid = log.session || recommend(state, today).session;
  return sid === 'rest' || !position(state, today) ? 'rest' : LOWER[sid] ? 'lower' : 'upper';
}
function nutritionTargetsHtml() {
  const kind = todayKind();
  const kinds = [['lower', '下肢大重量日（硬拉 / 深蹲）'], ['upper', '上肢日（推举 / 卧推）'], ['rest', '休息日']];
  return `${kinds.map(([k, label]) => { const n = nutritionFor(state, k); return `<div class="card"><div class="row between"><h2>${label}</h2>${k === kind ? '<span class="tag">今天</span>' : ''}</div>${macrosHtml(n)}<p class="muted">饮水 ${n.water}ml</p></div>`; }).join('')}
    <div class="card"><h2>今日建议</h2><ul class="tips">${nutritionTips(nutritionFor(state, kind)).map((t) => `<li>${t}</li>`).join('')}</ul></div>
    <p class="muted pad">数值依据 Mifflin-St Jeor 公式估算，按每周体重变化微调 ±100–200 千卡。身体数据变了，营养目标会自动重算。</p>`;
}
function bodyDataHtml() {
  const p = state.profile;
  const sel = (v, cur) => (String(v) === String(cur) ? 'selected' : '');
  return `<div class="card">
      <div class="grid2">
        <div><label>体重 (kg)</label><input type="number" step="0.1" data-profile="weight" value="${p.weight}"></div>
        <div><label>年龄</label><input type="number" data-profile="age" value="${p.age}"></div>
        <div><label>身高 (cm)</label><input type="number" data-profile="height" value="${p.height}"></div>
        <div><label>性别</label><select data-profile="sex"><option value="male" ${sel('male', p.sex)}>男</option><option value="female" ${sel('female', p.sex)}>女</option></select></div>
      </div>
      <label>活动量</label><select data-profile="activity">
        <option value="1.2" ${sel(1.2, p.activity)}>久坐（办公室、学生）</option><option value="1.35" ${sel(1.35, p.activity)}>轻度活动（经常走动）</option><option value="1.5" ${sel(1.5, p.activity)}>中度活动（体力工作）</option></select>
      <label>目标</label><div class="chips">${Object.entries(GOALS).map(([k, g]) => chip(g.label, `data-goal="${k}"`, p.goal === k)).join('')}</div>
      <p class="muted">修改后自动保存${cloud.user ? '并同步到账号' : ''}。体重会同时记入「历史 → 数据」的体重曲线。</p></div>`;
}
function bindNutrition() {
  const root = $('#view-me');
  root.addEventListener('change', (e) => {
    const k = e.target.dataset.profile;
    if (!k) return;
    state.profile[k] = k === 'sex' ? e.target.value : Number(e.target.value) || state.profile[k];
    if (k === 'weight') state.bodyweight[dateKey(new Date())] = state.profile.weight;
    save(); render();
  });
  root.addEventListener('click', (e) => {
    const g = e.target.closest('button')?.dataset.goal;
    if (!g) return;
    state.profile.goal = g; save(); render();
  });
}


function remindersHtml() {
  const r = state.reminders;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const permText = { granted: '已允许', denied: '已拒绝（请在系统设置中开启）', default: '未授权', unsupported: '此浏览器不支持（iPhone 需先添加到主屏幕）' }[perm];
  return `<div class="card">
      <label class="row check"><input type="checkbox" data-rem="enabled" ${r.enabled ? 'checked' : ''}> 开启应用内通知</label>
      <p class="muted">通知权限：${permText}</p>
      <label>每天早上提醒时间（今天练什么、多重、吃多少）</label><input type="time" data-rem="morning" value="${esc(r.morning)}">
      <label class="row check"><input type="checkbox" data-rem="meals" ${r.meals ? 'checked' : ''}> 同时提醒训练前 15 分钟和每一餐</label>
      <button class="btn small ghost block" data-act="test-notify">发送测试通知</button></div>
    <div class="card"><h2>导出到手机日历（推荐）</h2>
      <p class="muted">网页通知只有在 App 打开或在后台时才可靠。导出到日历后，即使不打开 App 也会准时提醒，每个训练日都带当天的具体重量。</p>
      <button class="btn block" data-act="ics">📅 导出未来 4 周训练到日历</button>
      <p class="muted">临时换了训练日或改了计划，重新导出一次即可。</p></div>`;
}
function dataHtml() {
  return `<div class="card"><p class="muted">${cloud.user ? '你已登录，数据会自动保存到云端。下面的备份文件可以额外留一份。' : '未登录时，数据只保存在这台手机上。建议登录账号，或定期导出备份。'}</p>
      <div class="row wrap"><button class="btn small ghost" data-act="export">导出备份</button>
        <button class="btn small ghost" data-act="import">导入备份</button>
        <button class="btn small danger" data-act="reset">清空重来</button></div>
      <input type="file" id="importFile" accept="application/json" hidden></div>`;
}
function installHtml() {
  return `<div class="card"><h2>iPhone</h2><p class="muted">用 Safari 打开 → 点底部「分享」→「添加到主屏幕」。必须用 Safari，微信里打开不行。</p></div>
    <div class="card"><h2>Android</h2><p class="muted">用 Chrome 打开 → 右上角菜单 →「安装应用」或「添加到主屏幕」。</p></div>`;
}
function trainingSettingsHtml() {
  return `<div class="card">
      <div class="kv"><span>主项动作</span><b>${LIFTS.map((l) => variantOf(state, l).name.replace(/（.*）/, '')).join('、')}</b></div>
      <div class="kv"><span>最大重量 1RM</span><b>${LIFTS.map((l) => `${LIFT_NAMES[l]} ${fmtW(state.lifts[l].oneRM)}`).join(' · ')}</b></div>
      <div class="kv"><span>训练日</span><b>${state.schedule.map((d) => WEEKDAYS[d]).join('、')} ${esc(state.trainTime)}</b></div>
      <div class="kv"><span>伤病</span><b>${state.injuries.map((i) => INJURIES[i]).join('、') || '无'}</b></div>
      <div class="kv"><span>器械</span><b>${state.equipment.length} 种</b></div>
      <div class="kv"><span>喜欢的动作</span><b>${state.favorites.map((id) => exById(state, id)?.name).filter(Boolean).map(esc).join('、') || '未设置'}</b></div>
      <button class="btn block" data-act="edit">修改训练设置</button>
      <p class="muted">会重新打开问卷，已填的内容都会保留。动作偏好也可以在「动作」页逐个设置。</p></div>`;
}

/* RM calculator: estimate 1RM from a set, then show training percentages */
let rmIn = { w: '', r: 5 };
function rmResultHtml() {
  const w = Number(rmIn.w), r = Math.max(1, Math.min(12, Number(rmIn.r) || 1));
  if (!(w > 0)) return '<p class="muted">输入一组的重量和次数，估算你的 1RM（最大重量）。</p>';
  const one = r === 1 ? w : (epley(w, r) + w * 36 / (37 - r)) / 2; // average of Epley and Brzycki
  const rows = [100, 95, 90, 85, 80, 75, 70, 65, 60, 50];
  const repsAt = { 100: 1, 95: 2, 90: 4, 85: 6, 80: 8, 75: 10, 70: 12, 65: 15, 60: 18, 50: 25 };
  return `<div class="rm-big"><span class="muted">估算 1RM</span><b>${fmtW(Math.round(one * 2) / 2)}<small>kg</small></b><span class="muted">TM（90%）≈ ${fmtW(roundTo(one * 0.9, 0.5))}kg</span></div>
    <table class="tm"><tr><th>百分比</th><th>重量</th><th>大约能做</th></tr>
    ${rows.map((p) => `<tr><td>${p}%</td><td><b>${fmtW(roundTo(one * p / 100, state.plateInc || 2.5))}kg</b></td><td>${repsAt[p]} 次</td></tr>`).join('')}</table>`;
}
function rmHtml() {
  return `<div class="card"><div class="grid2">
      <div><label>重量 (kg)</label><input id="rmW" type="number" inputmode="decimal" step="0.5" value="${esc(rmIn.w)}" placeholder="例如 100"></div>
      <div><label>次数</label><input id="rmR" type="number" inputmode="numeric" min="1" max="12" value="${esc(rmIn.r)}"></div></div>
      <div id="rmOut">${rmResultHtml()}</div>
      <p class="muted">次数越少越准，超过 10 次误差会变大。</p></div>`;
}

function bindSettings() {
  const root = $('#view-me');
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
    else if (a === 'export') download(`IanzFitness备份-${dateKey(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
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
      state = loadState(); save(); render(); toast('导入成功');
    } catch { toast('文件格式不正确'); }
  };
  r.readAsText(file);
}

let meSub = null;
const ME_PAGES = {
  body: ['身体数据', 'body', () => bodyDataHtml()],
  nutrition: ['营养目标', 'food', () => nutritionTargetsHtml()],
  training: ['训练设置', 'plan', () => trainingSettingsHtml()],
  rm: ['RM 计算器', 'calc', () => rmHtml()],
  reminders: ['提醒设置', 'bell', () => remindersHtml()],
  data: ['数据备份', 'data', () => dataHtml()],
  install: ['安装到手机', 'phone', () => installHtml()],
  account: ['账号与同步', 'cloud', () => accountCard()],
};

function renderMe() {
  if (meSub && ME_PAGES[meSub]) {
    const [title, , html] = ME_PAGES[meSub];
    $('#view-me').innerHTML = `<div class="sub-head"><button class="icon-round" data-act="me-back" aria-label="返回">${ICONS.back}</button><h1>${title}</h1></div>${html()}`;
    return;
  }
  const p = state.profile;
  const today = new Date();
  const pos = position(state, today);
  const n = history(state).length;
  const row = (k, extra = '') => `<button class="menu-row" data-me-sub="${k}"><span class="mi">${ICONS[ME_PAGES[k][1]]}</span><span class="grow">${ME_PAGES[k][0]}</span>${extra ? `<span class="muted">${extra}</span>` : ''}${ICONS.chevron}</button>`;
  let banner = '';
  if (cloudEnabled() && !cloud.user) {
    banner = `<button class="banner" data-act="login"><b>登录 Ianz Fitness</b><span>数据自动保存到云端，换手机也不丢 ›</span></button>`;
  } else if (cloud.user) {
    banner = `<button class="banner on" data-me-sub="account"><b>☁️ 云端同步已开启</b><span>${esc(syncText()) || '已登录'} ›</span></button>`;
  }
  $('#view-me').innerHTML = `
    <div class="me-top"><div class="avatar big">${esc((p.name || '我').slice(0, 1))}</div>
      <div class="grow"><div class="row"><h1 class="me-name">${p.name ? esc(p.name) : '未设置昵称'}</h1><button class="pill-btn" data-act="edit">修改信息</button></div>
        <div class="me-id">${cloud.user ? `<span class="ok">✓ 已登录</span> ${esc(accountLabel())}` : cloudEnabled() ? '未登录 · 数据仅保存在本机' : '本机模式'}</div></div></div>
    ${banner}
    <div class="me-stats"><div><b>${n}</b><span>累计训练</span></div><div><b>${pos ? `${pos.week}<small>/12</small>` : '—'}</b><span>当前周</span></div><div><b>${p.weight}<small>kg</small></b><span>体重</span></div></div>
    <div class="menu">${row('body', `${p.height}cm · ${GOALS[p.goal].label}`)}${row('nutrition')}${row('training')}${row('rm')}</div>
    <div class="menu">${row('reminders', state.reminders.enabled ? '已开启' : '')}${row('data')}${row('install')}</div>
    ${cloud.user ? `<div class="menu">${row('account')}<button class="menu-row danger" data-act="logout"><span class="mi">${ICONS.logout}</span><span class="grow">退出登录</span></button></div>` : ''}
    <p class="muted center pad">Ianz Fitness · 版本 ${APP_VERSION}</p>`;
}

function bindMe() {
  const root = $('#view-me');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.meSub) { meSub = b.dataset.meSub; render(); window.scrollTo(0, 0); }
    else if (b.dataset.act === 'me-back') { meSub = null; render(); }
  });
  root.addEventListener('input', (e) => {
    if (e.target.id !== 'rmW' && e.target.id !== 'rmR') return;
    rmIn = { w: $('#rmW').value, r: $('#rmR').value };
    $('#rmOut').innerHTML = rmResultHtml();
  });
}
