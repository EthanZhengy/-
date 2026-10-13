'use strict';
/* 动作: exercise library with category sidebar, equipment filters, search, details and preferences. */

let lib = { cat: 'main', eq: 'all', q: '', tab: 'all' };

function libraryItems() {
  const items = [];
  LIFTS.forEach((l) => VARIANTS[l].forEach((v) => items.push({ ...v, kind: 'main', lift: l, cats: ['main', LIFT_CAT[l]] })));
  allExercises(state).forEach((e) => items.push({ ...e, kind: 'acc', cats: [MUSCLE_CAT[e.m] || 'custom'] }));
  return items;
}
function itemState(it) {
  const missing = it.kind === 'main' ? !it.eq.every((t) => state.equipment.includes(t)) : !hasEquip(state, it);
  const bad = (it.avoid || []).filter((i) => state.injuries.includes(i));
  return {
    fav: state.favorites.includes(it.id), ex: state.excluded.includes(it.id),
    current: it.kind === 'main' && state.lifts[it.lift].variant === it.id, missing, bad,
  };
}

function renderLibrary() {
  const counts = exerciseCounts(history(state));
  const all = libraryItems();
  const q = lib.q.trim();
  let items = q ? all.filter((it) => it.name.includes(q)) : all.filter((it) => it.cats.includes(lib.cat));
  if (lib.eq !== 'all') items = items.filter((it) => primaryEq(it.eq) === lib.eq);
  if (lib.tab === 'mine') items = items.filter((it) => counts[it.id] || state.favorites.includes(it.id) || itemState(it).current)
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  // de-duplicate (main variants can appear twice under 主项 and a muscle)
  items = items.filter((it, i) => items.findIndex((x) => x.id === it.id) === i);

  const groups = EQ_FILTERS.filter(([k]) => k !== 'all').map(([k, label]) => [label, items.filter((it) => primaryEq(it.eq) === k)]).filter(([, l]) => l.length);
  const card = (it) => {
    const st = itemState(it);
    const n = counts[it.id];
    return `<button class="ex-card${st.ex || st.missing || st.bad.length ? ' dim' : ''}" data-ex="${it.id}">
      ${it.cue ? '<span class="ex-badge">讲解</span>' : ''}${n ? `<span class="ex-count">${n} 次</span>` : ''}
      <span class="ex-art">${EQ_GLYPH[primaryEq(it.eq)]}</span>
      <span class="ex-name">${esc(it.name.replace(/（.*）/, ''))}</span>
      <span class="ex-tags">${st.current ? '<i class="t-cur">当前主项</i>' : ''}${st.fav ? '<i>❤️</i>' : ''}${st.ex ? '<i>🚫</i>' : ''}${st.missing ? '<i>缺器械</i>' : ''}${st.bad.length ? `<i>不适合${st.bad.map((x) => INJURIES[x]).join('')}</i>` : ''}</span>
    </button>`;
  };

  $('#view-library').innerHTML = `
    <div class="lib-top"><label class="search">${ICONS.search}<input id="libSearch" placeholder="输入动作名字搜索" value="${esc(lib.q)}"></label>
      <button class="icon-round blue" data-act="add-ex" aria-label="添加动作">${ICONS.plus}</button></div>
    <div class="lib">
      <nav class="lib-side">${LIB_CATS.map(([k, l]) => `<button data-cat="${k}" class="${!q && lib.cat === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
      <div class="lib-main">
        <div class="eq-chips">${EQ_FILTERS.map(([k, l]) => `<button data-eqf="${k}" class="${lib.eq === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="utabs left">${[['all', '全部动作'], ['mine', '常用动作']].map(([k, l]) => `<button data-ltab="${k}" class="${lib.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="muted small">${q ? `搜索“${esc(q)}”` : LIB_CATS.find(([k]) => k === lib.cat)[1]} · ${items.length} 个动作</div>
        ${lib.cat === 'main' && !q ? '<p class="muted small">5/3/1 的四个主项及其替代动作。切换主项动作需要重新填写该动作的最大重量。</p>' : ''}
        ${groups.map(([label, list]) => `<h3 class="grp">${label}</h3><div class="ex-grid">${list.map(card).join('')}</div>`).join('') || `<p class="muted empty">${lib.tab === 'mine' ? '还没有常用动作。练过或点 ❤️ 的动作会出现在这里。' : '没有符合条件的动作'}</p>`}
      </div></div>`;
}

function openExercise(id) {
  const it = libraryItems().find((x) => x.id === id);
  if (!it) return;
  const st = itemState(it);
  const n = exerciseCounts(history(state))[id] || 0;
  const eqNames = (it.eq || []).map((t) => t.split('|').map((x) => EQUIPMENT[x] || x).join(' 或 '));
  const cats = it.cats.map((c) => LIB_CATS.find(([k]) => k === c)[1]);
  const warn = [st.missing && '你的器械里缺少这个动作需要的器械', st.bad.length && `可能加重你的${st.bad.map((x) => INJURIES[x]).join('、')}不适`].filter(Boolean);
  let actions;
  if (it.kind === 'main') {
    actions = st.current
      ? '<p class="muted">这是你当前的主项动作。</p>'
      : `<p class="muted">要把${LIFT_NAMES[it.lift]}换成这个动作，请重新填写问卷并输入它的最大重量。</p><button class="btn ghost block" data-act="wizard">去修改主项动作</button>`;
  } else {
    actions = `<div class="row"><button class="btn grow ${st.fav ? '' : 'ghost'}" data-pref="fav">${st.fav ? '❤️ 已喜欢' : '♡ 喜欢'}</button>
      <button class="btn grow ${st.ex ? 'danger-fill' : 'ghost'}" data-pref="ex">${st.ex ? '🚫 已设为不做' : '🚫 不做'}</button></div>
      <p class="muted">❤️ 喜欢的动作会被优先、经常安排；🚫 不做的动作不会出现在计划里。</p>
      ${it.id.startsWith('custom_') ? '<button class="btn danger block" data-act="del-custom">删除这个自定义动作</button>' : ''}`;
  }
  openSheet(it.name, `
    <div class="ex-detail-art">${EQ_GLYPH[primaryEq(it.eq)]}</div>
    <div class="chips static">${cats.map((c) => `<span class="chip">${c}</span>`).join('')}${eqNames.map((e) => `<span class="chip">${esc(e)}</span>`).join('') || '<span class="chip">徒手</span>'}</div>
    ${it.cue ? `<h3>动作要点</h3><p>${esc(it.cue)}</p>` : ''}
    ${it.reps ? `<p class="muted">建议次数：${esc(it.reps)}</p>` : ''}
    <p class="muted">已在 ${n} 次训练中出现</p>
    ${warn.map((w) => `<p class="warn">⚠️ ${w}</p>`).join('')}
    ${actions}`, { type: 'exercise', id, reopen: () => openExercise(id) });
}

function openAddExercise() {
  openSheet('添加自定义动作', `
    <label>动作名称</label><input id="cxName" placeholder="如：器械推胸">
    <label>用在哪里</label><select id="cxSlot">${Object.entries(SLOT_NAMES).map(([k, n]) => `<option value="${k}">${n}${k === 'upper' ? '（推举、卧推日）' : k === 'lower' ? '（硬拉、深蹲日）' : ''}</option>`).join('')}</select>
    <label>建议次数</label><input id="cxReps" value="10-15">
    <button class="btn block" data-act="save-custom">添加并设为喜欢</button>
    <p class="muted">自定义动作会被当作你喜欢的动作，穿插进对应训练日。</p>`, { type: 'add' });
}

function bindLibrary() {
  const root = $('#view-library');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const ds = b.dataset;
    if (ds.cat) { lib.cat = ds.cat; lib.q = ''; }
    else if (ds.eqf) lib.eq = ds.eqf;
    else if (ds.ltab) lib.tab = ds.ltab;
    else if (ds.ex) return openExercise(ds.ex);
    else if (ds.act === 'add-ex') return openAddExercise();
    else return;
    render();
  });
  root.addEventListener('input', (e) => {
    if (e.target.id !== 'libSearch') return;
    lib.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const inp = $('#libSearch'); inp.focus(); inp.setSelectionRange(pos, pos);
  });
  // preference actions inside the exercise sheet
  $('#sheet').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !sheetCtx) return;
    const ds = b.dataset;
    if (sheetCtx.type === 'exercise') {
      const id = sheetCtx.id;
      if (ds.pref === 'fav') { toggle(state.favorites, id); state.excluded = state.excluded.filter((x) => x !== id); }
      else if (ds.pref === 'ex') { toggle(state.excluded, id); state.favorites = state.favorites.filter((x) => x !== id); }
      else if (ds.act === 'wizard') { closeSheet(); return startWizard(true); }
      else if (ds.act === 'del-custom') {
        state.customEx = state.customEx.filter((x) => x.id !== id);
        state.favorites = state.favorites.filter((x) => x !== id);
        save(); closeSheet(); render(); return;
      } else return;
      save(); render(); refreshSheet();
    } else if (sheetCtx.type === 'add' && ds.act === 'save-custom') {
      const name = $('#cxName').value.trim();
      if (!name) return toast('请输入动作名称');
      const id = `custom_${Date.now()}`;
      state.customEx.push({ id, name, slot: $('#cxSlot').value, m: 'custom', eq: [], reps: $('#cxReps').value.trim() || '10-15' });
      state.favorites.push(id);
      lib.cat = 'custom'; lib.q = '';
      save(); closeSheet(); render(); toast('已添加');
    }
  });
}
