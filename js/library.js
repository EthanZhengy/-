'use strict';
/* 动作: exercise library with category sidebar, equipment filters, search, photos, details and preferences. */

let lib = { cat: 'main', eq: 'all', q: '', tab: 'all' };

/* The big photo library (js/exdb.js, ~870 exercises) is loaded the first time the 动作 tab opens. */
let exdbState = typeof EXDB !== 'undefined' ? 'ready' : 'idle';
function ensureExdb() {
  if (exdbState !== 'idle') return;
  exdbState = 'loading';
  const s = document.createElement('script');
  s.src = `js/exdb.js?v=${APP_VERSION}`;
  s.onload = () => { exdbState = 'ready'; if (typeof render === 'function') render(); };
  s.onerror = () => { exdbState = 'idle'; };
  document.head.appendChild(s);
}
const CURATED_IMGS = new Set(Object.values(EX_IMG));

function libraryItems() {
  const items = [];
  LIFTS.forEach((l) => VARIANTS[l].forEach((v) => items.push({ ...v, kind: 'main', lift: l, cats: ['main', LIFT_CAT[l]] })));
  const db = exdbState === 'ready' ? EXDB : [];
  const dbIds = new Set(db.map((d) => d.id));
  allExercises(state).forEach((e) => {
    if (e.db && dbIds.has(e.id)) return; // shown below as the library item it came from
    items.push({ ...e, kind: 'acc', cats: e.db ? e.cats : [MUSCLE_CAT[e.m] || 'custom'] });
  });
  db.forEach((d) => { if (!CURATED_IMGS.has(d.id)) items.push({ ...d, img: d.id, kind: 'db' }); });
  return items;
}
const itemEq = (it) => it.pe || primaryEq(it.eq);
function itemState(it) {
  const missing = it.kind === 'main' ? !it.eq.every((t) => state.equipment.includes(t)) : !hasEquip(state, it);
  const bad = (it.avoid || []).filter((i) => state.injuries.includes(i));
  return {
    fav: state.favorites.includes(it.id), ex: state.excluded.includes(it.id),
    current: it.kind === 'main' && state.lifts[it.lift].variant === it.id, missing, bad,
  };
}
const exArt = (it, cls = 'ex-art') => it.img
  ? `<span class="${cls} photo"><img src="${exImgUrl(it.img)}" alt="" loading="lazy" decoding="async"></span>`
  : `<span class="${cls}">${EQ_GLYPH[itemEq(it)] || EQ_GLYPH.body}</span>`;

function renderLibrary() {
  ensureExdb();
  const counts = exerciseCounts(trainingHistory(state));
  const all = libraryItems();
  const q = lib.q.trim().toLowerCase();
  let items = q ? all.filter((it) => it.name.toLowerCase().includes(q) || (it.en || '').toLowerCase().includes(q))
    : all.filter((it) => it.cats.includes(lib.cat));
  if (lib.eq !== 'all') items = items.filter((it) => itemEq(it) === lib.eq);
  if (lib.tab === 'mine') items = items.filter((it) => counts[it.id] || state.favorites.includes(it.id) || itemState(it).current)
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  // de-duplicate (main variants can appear twice under 主项 and a muscle)
  items = items.filter((it, i) => items.findIndex((x) => x.id === it.id) === i);
  const shown = items.slice(0, q ? 120 : 400);

  const groups = EQ_FILTERS.filter(([k]) => k !== 'all').map(([k, label]) => [label, shown.filter((it) => itemEq(it) === k)]).filter(([, l]) => l.length);
  const card = (it) => {
    const st = itemState(it);
    const n = counts[it.id];
    return `<button class="ex-card${st.ex || st.missing || st.bad.length ? ' dim' : ''}" data-ex="${esc(it.id)}">
      ${it.cue || it.s ? '<span class="ex-badge">讲解</span>' : ''}${n ? `<span class="ex-count">${n} 次</span>` : ''}
      ${exArt(it)}
      <span class="ex-name">${esc(it.name.replace(/（.*）/, ''))}</span>
      <span class="ex-tags">${st.current ? '<i class="t-cur">当前主项</i>' : ''}${st.fav ? '<i>❤️</i>' : ''}${st.ex ? '<i>🚫</i>' : ''}${st.missing ? '<i>缺器械</i>' : ''}${st.bad.length ? `<i>不适合${st.bad.map((x) => INJURIES[x]).join('')}</i>` : ''}</span>
    </button>`;
  };

  $('#view-library').innerHTML = `
    <div class="lib-top"><label class="search">${ICONS.search}<input id="libSearch" placeholder="搜索动作（中文或英文）" value="${esc(lib.q)}"></label>
      <button class="icon-round blue" data-act="add-ex" aria-label="添加动作">${ICONS.plus}</button></div>
    <div class="lib">
      <nav class="lib-side">${LIB_CATS.map(([k, l]) => `<button data-cat="${k}" class="${!q && lib.cat === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
      <div class="lib-main">
        <div class="eq-chips">${EQ_FILTERS.map(([k, l]) => `<button data-eqf="${k}" class="${lib.eq === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="utabs left">${[['all', '全部动作'], ['mine', '常用动作']].map(([k, l]) => `<button data-ltab="${k}" class="${lib.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="muted small">${q ? `搜索“${esc(lib.q.trim())}”` : LIB_CATS.find(([k]) => k === lib.cat)[1]} · ${items.length} 个动作${shown.length < items.length ? `（显示前 ${shown.length} 个，可搜索或筛选器械）` : ''}${exdbState === 'loading' ? ' · 动作库加载中…' : ''}</div>
        ${lib.cat === 'main' && !q ? '<p class="muted small">5/3/1 的四个主项及其替代动作。切换主项动作需要重新填写该动作的最大重量。</p>' : ''}
        ${groups.map(([label, list]) => `<h3 class="grp">${label}</h3><div class="ex-grid">${list.map(card).join('')}</div>`).join('') || `<p class="muted empty">${lib.tab === 'mine' ? '还没有常用动作。练过或点 ❤️ 的动作会出现在这里。' : '没有符合条件的动作'}</p>`}
        <p class="muted small center pad">动作图片来自公共领域的 free-exercise-db</p>
      </div></div>`;
}

const LEVEL_ZH = { beginner: '初级', intermediate: '中级', expert: '高级' };
function exPhotos(it) {
  if (!it.img) return `<div class="ex-detail-art">${EQ_GLYPH[itemEq(it)] || EQ_GLYPH.body}</div>`;
  return `<div class="ex-photo"><img src="${exImgUrl(it.img, 0)}" alt="起始姿势"><img class="end" src="${exImgUrl(it.img, 1)}" alt="结束姿势">
    <span class="ex-photo-tag">起始 ⇄ 结束</span></div>`;
}

function openExercise(id) {
  const it = libraryItems().find((x) => x.id === id);
  if (!it) return;
  const st = itemState(it);
  const n = exerciseCounts(trainingHistory(state))[id] || 0;
  const eqNames = (it.eq || []).map((t) => t.split('|').map((x) => EQUIPMENT[x] || x).join(' 或 '));
  if (it.pe === 'other' && it.eqName) eqNames.push(it.eqName);
  const cats = it.cats.map((c) => LIB_CATS.find(([k]) => k === c)[1]);
  const warn = [st.missing && '你的器械里缺少这个动作需要的器械', st.bad.length && `可能加重你的${st.bad.map((x) => INJURIES[x]).join('、')}不适`].filter(Boolean);
  let actions;
  if (it.kind === 'main') {
    actions = st.current
      ? '<p class="muted">这是你当前的主项动作。</p>'
      : `<p class="muted">要把${LIFT_NAMES[it.lift]}换成这个动作，请重新填写问卷并输入它的最大重量。</p><button class="btn ghost block" data-act="wizard">去修改主项动作</button>`;
  } else if (it.kind === 'db' && !it.slot) {
    actions = '<p class="muted">这个动作适合热身、拉伸或专项训练，不会自动排进计划。</p>';
  } else if (it.kind === 'db') {
    actions = `<button class="btn block ${st.fav ? '' : 'ghost'}" data-pref="fav">${st.fav ? '❤️ 已加入我的辅助动作' : '♡ 喜欢，加入我的辅助动作'}</button>
      <p class="muted">喜欢的动作会被穿插进对应训练日（${SLOT_NAMES[it.slot]}）。</p>`;
  } else {
    actions = `<div class="row"><button class="btn grow ${st.fav ? '' : 'ghost'}" data-pref="fav">${st.fav ? '❤️ 已喜欢' : '♡ 喜欢'}</button>
      <button class="btn grow ${st.ex ? 'danger-fill' : 'ghost'}" data-pref="ex">${st.ex ? '🚫 已设为不做' : '🚫 不做'}</button></div>
      <p class="muted">❤️ 喜欢的动作会被优先、经常安排；🚫 不做的动作不会出现在计划里。</p>
      ${it.id.startsWith('custom_') ? '<button class="btn danger block" data-act="del-custom">删除这个自定义动作</button>' : ''}`;
  }
  const muscles = it.pm ? `<p><b>主要肌群</b>：${it.pm.join('、')}${it.sm && it.sm.length ? `<br><b>辅助肌群</b>：${it.sm.join('、')}` : ''}</p>` : '';
  openSheet(it.name, `
    ${exPhotos(it)}
    ${it.en ? `<p class="muted small center">${esc(it.en)}</p>` : ''}
    <div class="chips static">${cats.map((c) => `<span class="chip">${c}</span>`).join('')}${eqNames.map((e) => `<span class="chip">${esc(e)}</span>`).join('') || '<span class="chip">徒手</span>'}${it.lv ? `<span class="chip">${LEVEL_ZH[it.lv]}</span>` : ''}</div>
    ${muscles}
    ${it.cue ? `<h3>动作要点</h3><p>${esc(it.cue)}</p>` : ''}
    ${it.s ? `<h3>动作步骤</h3><ol class="ex-steps">${it.s.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
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

/** Liking a library exercise copies it into customEx so the planner can use it without loading the library. */
function toggleDbFavorite(id) {
  const d = (typeof EXDB !== 'undefined' ? EXDB : []).find((x) => x.id === id);
  const on = state.favorites.includes(id);
  state.customEx = (state.customEx || []).filter((x) => x.id !== id);
  state.favorites = state.favorites.filter((x) => x !== id);
  if (!on && d && d.slot) {
    const { s, sm, en, ...keep } = d;
    state.customEx.push({ ...keep, img: d.id, db: true });
    state.favorites.push(id);
  }
}

function bindLibrary() {
  const root = $('#view-library');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const ds = b.dataset;
    if (ds.cat) { lib.cat = ds.cat; lib.q = ''; root.scrollTop = 0; window.scrollTo(0, 0); }
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
      const isDb = typeof EXDB !== 'undefined' && EXDB.some((x) => x.id === id) && !CURATED_IMGS.has(id);
      if (ds.pref === 'fav' && isDb) toggleDbFavorite(id);
      else if (ds.pref === 'fav') { toggle(state.favorites, id); state.excluded = state.excluded.filter((x) => x !== id); }
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
