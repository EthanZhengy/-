'use strict';
/* ================= Onboarding questionnaire ================= */

const STEPS = ['欢迎', '基础信息', '身体与器械', '主项与最大重量', '训练安排与偏好', '你的计划'];
let wiz = null;

function startWizard(fromSettings) {
  const draft = clone(state);
  const inputs = {};
  LIFTS.forEach((l) => (inputs[l] = { w: draft.lifts[l].oneRM || '', reps: 1 }));
  const resume = !state.onboarded && state.wizStep > 0 ? Math.min(state.wizStep, STEPS.length - 1) : 0;
  wiz = { step: fromSettings ? 1 : resume, draft, inputs, startOpt: state.onboarded ? 'keep' : 'this', startWeek: 1, doneNow: [] };
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
        <h2>欢迎使用 Ianz Fitness</h2>
        <p>回答几个问题（约 2 分钟），我会根据你的身体数据、最大重量、伤病和器械情况，生成：</p>
        <ul class="tips"><li>12 周 5/3/1 力量计划，每一组都算好具体重量</li>
        <li>每天适合你的拉类、核心和辅助动作（自动避开你做不了的动作）</li>
        <li>训练日 / 休息日的营养目标和餐次安排</li></ul>
        <p class="muted">每天你还可以告诉我「今天想练什么」和「今天状态如何」，计划会自动调整。</p>
        ${cloudEnabled() && !cloud.user ? '<div class="card account"><b>已经有账号？</b><p class="muted">登录后自动恢复你的计划和训练记录。</p><button class="btn ghost block" data-act="login">登录</button></div>' : ''}`;
      break;
    case 1:
      body = `${wiz.greet !== undefined ? `<h2>你好${wiz.greet ? `，${esc(wiz.greet)}` : ''} 👋</h2>
        <p>欢迎加入 Ianz Fitness！先花 2 分钟完善你的信息，会自动保存到你的账号，下次登录直接进入训练。</p><h3>基础信息</h3>` : '<h2>基础信息</h2>'}<p class="muted">用于计算你的热量和营养需求。</p>
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
        ${wiz.startOpt === 'week' ? `<label>本周是第几周</label><select data-start-week>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${wiz.startWeek === i + 1 ? 'selected' : ''}>第 ${i + 1} 周 · ${WEEKS[i].name}</option>`).join('')}</select>
          ${wiz.startWeek > 1 ? `<p class="muted">第 1–${wiz.startWeek - 1} 周会标记为 <span class="badge offline">📝 App 外完成</span>，之后可以在「挑战」里逐次修改。</p>` : ''}` : ''}
        ${wiz.startOpt === 'this' || wiz.startOpt === 'week' ? `<label>这周已经练过哪些？（在 App 外完成的）</label>
          <div class="chips">${orderFor(wiz.startOpt === 'week' ? wiz.startWeek : 1).map((s) => chip(sessionName(s, wiz.startOpt === 'week' ? wiz.startWeek : 1), `data-done-now="${s}"`, wiz.doneNow.includes(s))).join('')}</div>` : ''}
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
    <div id="wizAccount">${wizAccountHtml()}</div>
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
      persistWizard();
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
    } else if (ds.start) { wiz.startOpt = ds.start; wiz.doneNow = []; }
    else if (ds.doneNow) toggle(wiz.doneNow, ds.doneNow);
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
    } else if (t.dataset.startWeek !== undefined) { wiz.startWeek = Number(t.value); wiz.doneNow = []; render(); }
    else if (t.dataset.p === 'sex' || t.dataset.p === 'activity') { d.profile[t.dataset.p] = t.dataset.p === 'sex' ? t.value : Number(t.value); }
  });
}
function toggle(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }

/** Keep questionnaire answers as they are entered (and sync them when signed in), so they never need re-entering. */
const WIZ_FIELDS = ['profile', 'lifts', 'plateInc', 'equipment', 'injuries', 'favorites', 'excluded', 'customEx', 'schedule', 'trainTime'];
function persistWizard() {
  if (state.onboarded) return; // editing an existing plan only applies on 完成
  WIZ_FIELDS.forEach((k) => (state[k] = clone(wiz.draft[k])));
  state.wizStep = wiz.step;
  save();
}

function finishWizard() {
  const d = wiz.draft;
  const newStart = computeStart();
  if (newStart !== state.startDate) d.tests = {};
  d.startDate = newStart;
  d.onboarded = true;
  d.wizStep = 0;
  d.logs = state.logs;
  state = d;
  // Weeks already trained before using the app → mark as completed outside the app
  const today = new Date();
  const curWeek = wiz.startOpt === 'week' ? wiz.startWeek - 1 : wiz.startOpt === 'this' ? 0 : -1;
  for (let w = 0; w < curWeek; w++) {
    orderFor(w + 1).slice(0, requiredFor(w + 1)).forEach((sid) => {
      if (!['app', 'offline'].includes(sessionStatus(state, w, sid, today).status)) markOffline(state, w, sid, today);
    });
  }
  if (curWeek >= 0) wiz.doneNow.forEach((sid) => markOffline(state, curWeek, sid, today));
  wiz = null;
  save();
  currentView = 'home';
  scheduleReminders();
  render();
  toast('计划已生成，开始训练吧！');
  if (typeof handlePendingInvite === 'function') handlePendingInvite();
}
