'use strict';
/*
 * 大神方案: users publish their training days as plans; others browse, like, favourite, tip (打赏 via the
 * author's own payment QR code — the app never handles money) and import them as custom training days.
 * Requires supabase/plans.sql.
 */

const mk = { tab: 'hot', tag: null, q: '', plans: [], liked: new Set(), faved: new Set(), loading: false, loaded: false, error: '', back: 'home', pub: null };
const PLAN_TAGS = ['力量举', '卧推', '深蹲', '硬拉', '增肌', '减脂', '新手', '居家'];

function openMarket() {
  if (currentView !== 'market') mk.back = currentView;
  currentView = 'market';
  render(); window.scrollTo(0, 0);
}

async function loadMarket() {
  if (!socialReady() || mk.loading) return;
  mk.loading = true; mk.error = '';
  const c = cloud.client, uid = cloud.user.id;
  try {
    const [lk, fv] = await Promise.all([c.from('plan_likes').select('plan_id').eq('user_id', uid), c.from('plan_favs').select('plan_id').eq('user_id', uid)]);
    if (lk.error) throw lk.error;
    mk.liked = new Set((lk.data || []).map((x) => x.plan_id));
    if (!comm.loaded) { const fo = await c.from('follows').select('followee').eq('follower', uid); if (!fo.error) comm.following = new Set((fo.data || []).map((x) => x.followee)); }
    mk.faved = new Set((fv.data || []).map((x) => x.plan_id));
    let q = c.from('plans').select('*');
    if (mk.tag) q = q.contains('tags', [mk.tag]);
    if (mk.q.trim()) q = q.ilike('title', `%${mk.q.trim()}%`);
    if (mk.tab === 'fav') q = q.in('id', [...mk.faved]);
    if (mk.tab === 'mine') q = q.eq('user_id', uid);
    q = mk.tab === 'hot' ? q.order('fav_count', { ascending: false }).order('like_count', { ascending: false }).order('created_at', { ascending: false })
      : q.order('created_at', { ascending: false });
    const { data, error } = await q.limit(50);
    if (error) throw error;
    mk.plans = (data || []).filter((p) => !(state.blocked || []).includes(p.user_id));
    mk.loaded = true;
  } catch (err) {
    mk.error = isMissingTable(err) ? 'need-sql' : err.message || String(err);
  }
  mk.loading = false;
  if (currentView === 'market') render();
}
function reloadMarket() { mk.loaded = false; render(); loadMarket(); }

const planCover = (p) => { for (const d of p.days || []) for (const e of d.exercises || []) if (e.img) return exImgUrl(e.img); return null; };
const planExCount = (p) => (p.days || []).reduce((a, d) => a + (d.exercises || []).length, 0);

function renderMarket() {
  const root = $('#view-market');
  const head = `<div class="fr-head"><button class="icon-round" data-mk="back" aria-label="返回">${ICONS.back}</button><h1 class="grow mk-h1">🏆 大神方案</h1>
    ${socialReady() ? '<button class="btn small" data-mk="publish">＋ 发布</button>' : ''}</div>`;
  if (!cloudEnabled() || !cloud.user) {
    root.innerHTML = `${head}<div class="card center fr-empty"><div class="fr-hero">🏆</div><h2>看看大神们怎么练</h2>
      <p class="muted">登录后可以浏览、收藏、使用别人分享的训练方案，也可以发布自己的。</p><button class="btn block" data-act="login">登录 / 注册</button></div>`;
    return;
  }
  if (!mk.loaded && !mk.loading && !mk.error) setTimeout(loadMarket, 0);
  if (mk.error === 'need-sql') {
    root.innerHTML = `${head}<div class="card"><h2>大神方案还差一步</h2><p class="muted">请在 Supabase → SQL Editor 运行仓库里的 <b>supabase/plans.sql</b>（需先运行 community.sql），然后回来刷新。</p>
      <button class="btn block" data-mk="reload">重新加载</button></div>`;
    return;
  }
  const tabs = `<div class="utabs left">${[['hot', '热门'], ['new', '最新'], ['fav', '我的收藏'], ['mine', '我发布的']].map(([k, l]) => `<button data-mktab="${k}" class="${mk.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const filters = `<label class="search">${ICONS.search}<input id="mkSearch" placeholder="搜索方案名称" value="${esc(mk.q)}"></label>
    <div class="eq-chips">${['全部', ...PLAN_TAGS].map((t) => `<button data-mktag="${t}" class="${(mk.tag || '全部') === t ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  let list;
  if (!mk.loaded) list = `<div class="card center"><p class="muted">${mk.error ? `加载失败：${esc(mk.error)}` : '加载中…'}</p>${mk.error ? '<button class="btn block" data-mk="reload">重试</button>' : ''}</div>`;
  else if (!mk.plans.length) {
    list = `<div class="card center fr-empty"><div class="fr-hero">${mk.tab === 'fav' ? '⭐' : '📋'}</div><h2>${{ fav: '还没有收藏方案', mine: '你还没有发布方案' }[mk.tab] || '还没有方案'}</h2>
      <p class="muted">${mk.tab === 'mine' || mk.tab === 'hot' || mk.tab === 'new' ? '在「训练模板」里新增训练日、加好动作，就能发布成方案分享给大家。' : '看到喜欢的方案点 ⭐ 收藏。'}</p>
      <button class="btn block" data-mk="publish">发布方案</button></div>`;
  } else {
    list = `<div class="mk-grid">${mk.plans.map((p) => {
      const cover = planCover(p);
      return `<button class="mk-card" data-mkopen="${p.id}">
        <span class="mk-cover"${cover ? '' : ' data-empty'}>${cover ? `<img src="${cover}" alt="" loading="lazy">` : '🏋️'}</span>
        <span class="mk-body"><b>${esc(p.title)}</b>
          <span class="muted small">${esc(p.author_name || '健身er')} · ${p.days.length} 天 · ${planExCount(p)} 个动作</span>
          ${p.tags.length ? `<span class="mk-tags">${p.tags.map((t) => `<i>${esc(t)}</i>`).join('')}</span>` : ''}
          <span class="mk-stats"><span class="${mk.liked.has(p.id) ? 'on' : ''}">👍 ${p.like_count}</span><span class="${mk.faved.has(p.id) ? 'on' : ''}">⭐ ${p.fav_count}</span><span>📥 ${p.use_count}</span></span></span></button>`;
    }).join('')}</div>`;
  }
  root.innerHTML = `${head}${tabs}${filters}${list}<p class="muted small center pad">打赏通过作者自己的收款码直接付给作者，App 不经手任何款项。</p>`;
}

/* ---------- plan detail ---------- */
function openPlan(id) {
  const p = mk.plans.find((x) => x.id === id);
  if (!p) return;
  const mine = p.user_id === cloud.user.id;
  openSheet(p.title, `<div class="mk-author"><button class="cm-av" data-cmuser="${p.user_id}">${avatarHtml(p.user_id, p.author_name, 'sm')}</button>
      <div class="grow"><b>${esc(p.author_name || '健身er')}</b><div class="muted small">${relTime(p.created_at)} 发布 · ${p.use_count} 人使用</div></div>
      ${mine ? '' : `<button class="cm-follow${comm.following.has(p.user_id) ? ' on' : ''}" data-cmfollow="${p.user_id}">${comm.following.has(p.user_id) ? '已关注' : '＋ 关注'}</button>`}</div>
    ${p.tags.length ? `<div class="mk-tags">${p.tags.map((t) => `<i>${esc(t)}</i>`).join('')}</div>` : ''}
    ${p.intro ? `<p class="pre">${esc(p.intro)}</p>` : ''}
    ${p.days.map((d) => `<div class="mk-day"><h3>${esc(d.name)}</h3>${(d.exercises || []).map((e) => `<div class="tpl-ex">${e.img ? `<img src="${exImgUrl(e.img)}" alt="">` : '<span class="mk-noimg">🏋️</span>'}
      <div class="grow"><b>${esc(e.name)}</b><div class="muted small">${e.follow ? '跟随主项强度（和主项同样的百分比、组数、次数）' : `${e.sets} 组 × ${e.reps} 次`}${e.note ? ` · ${esc(e.note)}` : ''}</div></div></div>`).join('')}</div>`).join('')}
    <div class="mk-actions">
      <button class="${mk.liked.has(id) ? 'on' : ''}" data-mklike="${id}">👍<span>${mk.liked.has(id) ? '已赞' : '点赞'} ${p.like_count}</span></button>
      <button class="${mk.faved.has(id) ? 'on' : ''}" data-mkfav="${id}">⭐<span>${mk.faved.has(id) ? '已收藏' : '收藏'} ${p.fav_count}</span></button>
      <button data-mktip="${id}">🧧<span>打赏</span></button>
      <button data-mkmore="${id}">⋯<span>更多</span></button></div>
    <button class="btn block big" data-mkuse="${id}">使用这个方案</button>
    <p class="muted small">使用后，方案里的训练日会加到你当前计划（${esc(progOf().name)}）的「训练模板」里，作为可选的自定义训练日。</p>`, { type: 'mkplan', id, reopen: () => openPlan(id) });
}

async function toggleRel(table, set, field, id) {
  const p = mk.plans.find((x) => x.id === id);
  const on = set.has(id);
  if (on) set.delete(id); else set.add(id);
  if (p) p[field] = Math.max(0, p[field] + (on ? -1 : 1));
  render(); refreshSheet();
  const r = on ? await cloud.client.from(table).delete().eq('plan_id', id).eq('user_id', cloud.user.id)
    : await cloud.client.from(table).insert({ plan_id: id, user_id: cloud.user.id });
  if (r.error && !/duplicate/i.test(r.error.message)) toast(`操作失败：${r.error.message}`);
  else if (table === 'plan_favs') toast(on ? '已取消收藏' : '已收藏，可在「我的收藏」里找到');
}

function showTip(id) {
  const p = mk.plans.find((x) => x.id === id);
  if (!p.tip_image) return toast('作者还没有设置收款码，点个赞、收藏一下支持 TA 吧');
  let el = $('#cmViewer');
  if (!el) { el = document.createElement('div'); el.id = 'cmViewer'; document.body.appendChild(el); }
  el.innerHTML = `<div class="mk-tip"><b>打赏 ${esc(p.author_name || '作者')}</b><img src="${esc(p.tip_image)}" alt="收款码">
    <p>长按图片保存或识别二维码，用微信 / 支付宝付款。<br>款项直接付给作者，App 不经手。</p><button class="btn ghost block">关闭</button></div>`;
  el.hidden = false;
  el.onclick = (e) => { if (!e.target.closest('img')) el.hidden = true; };
}

function usePlan(id) {
  const p = mk.plans.find((x) => x.id === id);
  if (!p || !confirm(`把「${p.title}」的 ${p.days.length} 个训练日加到你的训练模板？`)) return;
  const order = position(state, new Date()) ? orderFor(position(state, new Date()).week) : orderFor(1);
  const list = state.customDays[state.program] = state.customDays[state.program] || [];
  p.days.forEach((d, i) => {
    const dayId = `cd_${Date.now().toString(36)}${i}`;
    list.push({ id: dayId, name: `${d.name}`.slice(0, 16), ref: order[0], from: p.title });
    state.tplEx[dayId] = (d.exercises || []).map((e, j) => ({
      k: `${Date.now().toString(36)}${i}${j}`, id: e.id || `plan_${id.slice(0, 8)}_${j}`, name: e.name, img: e.img || null, cue: e.cue || '',
      follow: false, ratio: null, base: null, sets: Number(e.sets) || 3, reps: Number(e.reps) || (e.follow ? 5 : 10),
    }));
  });
  save();
  cloud.client.from('plan_uses').insert({ plan_id: id, user_id: cloud.user.id }).then((r) => { if (!r.error) { p.use_count++; render(); } });
  closeSheet();
  toast(`已加入训练模板：${p.days.map((d) => d.name).join('、')}`);
  const hasFollow = p.days.some((d) => (d.exercises || []).some((e) => e.follow));
  if (hasFollow) setTimeout(() => toast('原方案里「跟随主项强度」的动作已改成固定组数，可在模板里编辑并填 1RM'), 2600);
}

/* ---------- publish ---------- */
function allMyDays() {
  return Object.entries(state.customDays || {}).flatMap(([prog, days]) => days.map((d) => ({ ...d, prog })));
}
function openPublishPlan(preselect) {
  if (!socialReady()) return toast('登录后才能发布方案');
  if (!mk.pub || preselect) mk.pub = { title: '', intro: '', tags: [], days: preselect || [], tipFile: null, tipUrl: null, useSavedTip: !!state.tipImage };
  const d = mk.pub;
  const days = allMyDays();
  openSheet('发布方案', `<label>方案名称</label><input id="mkTitle" maxlength="40" placeholder="如：卧推三推法（Mike 加强版）" value="${esc(d.title)}">
    <label>介绍</label><textarea id="mkIntro" rows="4" maxlength="2000" placeholder="适合什么人、每周怎么安排、注意事项…">${esc(d.intro)}</textarea>
    <label>标签（最多 5 个）</label><div class="chips">${PLAN_TAGS.map((t) => `<button class="chip${d.tags.includes(t) ? ' on' : ''}" data-mkptag="${t}">${t}</button>`).join('')}</div>
    <label>包含的训练日</label>
    ${days.length ? days.map((x) => `<div class="tpl-ex"><button class="chk${d.days.includes(x.id) ? ' on' : ''}" data-mkpday="${x.id}">✓</button>
      <div class="grow"><b>${esc(x.name)}</b><div class="muted small">${PROGRAMS[x.prog] ? esc(PROGRAMS[x.prog].short) + ' · ' : ''}${(state.tplEx[x.id] || []).length} 个动作</div></div></div>`).join('')
      : '<p class="warn">你还没有自定义训练日。先在「训练 → 训练模板 → ＋ 新增训练日」里建好训练日并添加动作。</p>'}
    <label>打赏收款码（可选）</label>
    <div class="row mk-tipset">${d.tipUrl || (d.useSavedTip && state.tipImage) ? `<img src="${esc(d.tipUrl || state.tipImage)}" alt="">` : ''}
      <label class="btn small ghost">${d.tipUrl || (d.useSavedTip && state.tipImage) ? '更换' : '上传微信 / 支付宝收款码'}<input type="file" id="mkTip" accept="image/*" hidden></label>
      ${d.tipUrl || (d.useSavedTip && state.tipImage) ? '<button class="link" data-mkp="notip">不设置</button>' : ''}</div>
    <button class="btn block big" data-mkp="submit" id="mkSubmit">发布</button>
    <p class="muted small">方案公开给所有登录用户。只会分享动作、组数和次数，不包含你的重量和身体数据。</p>`, { type: 'mkpub', reopen: () => openPublishPlan() });
}
function readPub() {
  if (!mk.pub || !$('#mkTitle')) return;
  mk.pub.title = $('#mkTitle').value.trim(); mk.pub.intro = $('#mkIntro').value.trim();
}
async function submitPlan() {
  readPub();
  const d = mk.pub;
  if (!d.title) return toast('请输入方案名称');
  if (!d.days.length) return toast('请至少选择一个训练日');
  const btn = $('#mkSubmit'); btn.disabled = true; btn.textContent = '发布中…';
  try {
    await ensureProfile();
    let tip = d.useSavedTip ? state.tipImage || null : null;
    if (d.tipFile) { [tip] = await uploadPhotos([d.tipFile]); state.tipImage = tip; save(); }
    const days = d.days.map((id) => customDay(state, id)).filter(Boolean).map((day) => ({
      name: day.name,
      exercises: (state.tplEx[day.id] || []).map((e) => ({ id: e.id, name: e.name, img: e.img || null, cue: e.cue || '', sets: e.sets, reps: e.reps, follow: !!e.follow })),
    }));
    const { error } = await cloud.client.from('plans').insert({ title: d.title, intro: d.intro, tags: d.tags, days, tip_image: tip });
    if (error) throw error;
    mk.pub = null; closeSheet(); toast('发布成功 🎉');
    mk.tab = 'mine'; if (currentView !== 'market') openMarket(); else reloadMarket();
  } catch (err) {
    btn.disabled = false; btn.textContent = '发布';
    toast(isMissingTable(err) ? '请先在 Supabase 运行 supabase/plans.sql' : `发布失败：${err.message || err}`);
  }
}

function bindMarket() {
  const root = $('#view-market');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const ds = b.dataset;
    if (ds.mk === 'back') { currentView = mk.back || 'home'; render(); }
    else if (ds.mk === 'reload') { mk.error = ''; reloadMarket(); }
    else if (ds.mk === 'publish') openPublishPlan();
    else if (ds.mktab) { mk.tab = ds.mktab; reloadMarket(); }
    else if (ds.mktag) { mk.tag = ds.mktag === '全部' ? null : ds.mktag; reloadMarket(); }
    else if (ds.mkopen) openPlan(ds.mkopen);
  });
  let timer;
  root.addEventListener('input', (e) => {
    if (e.target.id !== 'mkSearch') return;
    mk.q = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => { loadMarket().then(() => { const i = $('#mkSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 400);
  });
  $('#sheet').addEventListener('click', (e) => {
    if (!sheetCtx || !['mkplan', 'mkpub'].includes(sheetCtx.type)) return;
    const b = e.target.closest('button');
    if (!b) return;
    const ds = b.dataset;
    if (sheetCtx.type === 'mkplan') {
      if (ds.mklike) toggleRel('plan_likes', mk.liked, 'like_count', ds.mklike);
      else if (ds.mkfav) toggleRel('plan_favs', mk.faved, 'fav_count', ds.mkfav);
      else if (ds.mktip) showTip(ds.mktip);
      else if (ds.mkuse) usePlan(ds.mkuse);
      else if (ds.cmfollow) toggleFollow(ds.cmfollow).then(() => refreshSheet());
      else if (ds.cmuser) openUser(ds.cmuser);
      else if (ds.mkmore) {
        const p = mk.plans.find((x) => x.id === ds.mkmore);
        if (p.user_id === cloud.user.id) {
          if (!confirm('删除这个方案？')) return;
          cloud.client.from('plans').delete().eq('id', p.id).then(({ error }) => {
            if (error) return toast(`删除失败：${error.message}`);
            mk.plans = mk.plans.filter((x) => x.id !== p.id); closeSheet(); render(); toast('已删除');
          });
        } else {
          const reason = prompt('举报这个方案的原因（可不填）：', '');
          if (reason === null) return;
          cloud.client.from('plan_reports').insert({ plan_id: p.id, user_id: cloud.user.id, reason }).then(() => toast('已举报，感谢反馈'));
        }
      }
      return;
    }
    // publish form
    const d = mk.pub;
    if (ds.mkptag) { readPub(); if (d.tags.includes(ds.mkptag)) d.tags = d.tags.filter((x) => x !== ds.mkptag); else if (d.tags.length < 5) d.tags.push(ds.mkptag); refreshSheet(); }
    else if (ds.mkpday) { readPub(); toggle(d.days, ds.mkpday); refreshSheet(); }
    else if (ds.mkp === 'notip') { readPub(); d.tipFile = null; if (d.tipUrl) URL.revokeObjectURL(d.tipUrl); d.tipUrl = null; d.useSavedTip = false; refreshSheet(); }
    else if (ds.mkp === 'submit') submitPlan();
  });
  $('#sheet').addEventListener('change', (e) => {
    if (e.target.id !== 'mkTip' || !mk.pub || !e.target.files[0]) return;
    readPub();
    mk.pub.tipFile = e.target.files[0];
    mk.pub.tipUrl = URL.createObjectURL(e.target.files[0]);
    refreshSheet();
  });
}
