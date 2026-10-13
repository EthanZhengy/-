'use strict';
/* ================= 我的: profile, nutrition targets, settings ================= */

function nutritionSection() {
  const p = state.profile;
  const sel = (v, cur) => (String(v) === String(cur) ? 'selected' : '');
  const today = new Date();
  const log = logFor(dateKey(today));
  const sid = log.session || recommend(state, today).session;
  const kind = sid === 'rest' || !position(state, today) ? 'rest' : LOWER[sid] ? 'lower' : 'upper';
  const kinds = [['lower', '下肢大重量日（硬拉 / 深蹲）'], ['upper', '上肢日（推举 / 卧推）'], ['rest', '休息日']];
  return `
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
  const root = $('#view-me');
  root.addEventListener('change', (e) => {
    const k = e.target.dataset.profile;
    if (!k) return;
    state.profile[k] = Number(e.target.value) || state.profile[k];
    if (k === 'weight') state.bodyweight[dateKey(new Date())] = state.profile.weight;
    save(); render();
  });
  root.addEventListener('click', (e) => {
    const g = e.target.closest('button')?.dataset.goal;
    if (!g) return;
    state.profile.goal = g; save(); render();
  });
}


function settingsSection() {
  const r = state.reminders;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const permText = { granted: '已允许', denied: '已拒绝（请在浏览器设置中开启）', default: '未授权', unsupported: '此浏览器不支持' }[perm];
  const p = state.profile;
  return `
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

function renderMe() {
  const p = state.profile;
  const today = new Date();
  const pos = position(state, today);
  const n = history(state).length;
  $('#view-me').innerHTML = `<div class="page-head"><h1>我的</h1></div>
    <div class="card me-head"><div class="avatar">${esc((p.name || '我').slice(0, 1))}</div>
      <div class="grow"><h2>${p.name ? esc(p.name) : '未设置昵称'}</h2>
        <div class="muted">${p.sex === 'male' ? '男' : '女'} · ${p.age} 岁 · ${p.height}cm · ${p.weight}kg · ${GOALS[p.goal].label}</div>
        <div class="muted">${pos ? `第 ${pos.cycle + 1} 轮第 ${pos.week} 周` : '计划未开始'} · 已训练 ${n} 次</div></div></div>
    <div class="card"><h2>我的训练设置</h2>
      <div class="kv"><span>主项动作</span><b>${LIFTS.map((l) => variantOf(state, l).name.replace(/（.*）/, '')).join('、')}</b></div>
      <div class="kv"><span>训练日</span><b>${state.schedule.map((d) => WEEKDAYS[d]).join('、')} ${esc(state.trainTime)}</b></div>
      <div class="kv"><span>伤病</span><b>${state.injuries.map((i) => INJURIES[i]).join('、') || '无'}</b></div>
      <div class="kv"><span>喜欢的动作</span><b>${state.favorites.map((id) => exById(state, id)?.name).filter(Boolean).map(esc).join('、') || '未设置'}</b></div>
      <button class="btn block" data-act="edit">重新填写问卷</button>
      <p class="muted">修改身体数据、最大重量、伤病、器械、训练日和动作偏好。动作偏好也可以在「动作」页逐个设置。</p></div>
    <h3 class="sec-title">营养</h3>${nutritionSection()}
    <h3 class="sec-title">设置</h3>${settingsSection()}`;
}
