'use strict';
/*
 * Profile photo / bio / status, 24-hour stories (快拍, like Instagram) and the shared report sheet.
 * Requires supabase/stories.sql. Public profile cards are cached in PEOPLE (social.js).
 */

const story = { list: [], loaded: false, loading: false, draft: null, view: null, liked: new Set(), stats: {} };
const STATUS_PRESETS = ['💪 增肌中', '🔥 减脂中', '🏆 备赛中', '📈 冲 PR 中', '🧘 恢复期', '🤕 养伤中', '✈️ 出差中', '😴 休息中'];
const REPORT_REASONS = ['广告 / 引流', '色情低俗', '侮辱谩骂', '抄袭 / 盗图', '危险或错误的训练建议', '其他'];

/* ---------- public profiles ---------- */
async function fetchPeople(ids, force = false) {
  if (!socialReady()) return;
  const need = [...new Set(ids)].filter((id) => id && (force || !PEOPLE[id]));
  if (!need.length) return;
  const { data, error } = await cloud.client.rpc('public_profiles', { ids: need.slice(0, 200) });
  if (error) return; // stories.sql not run yet: fall back to letter avatars
  (data || []).forEach((p) => { PEOPLE[p.user_id] = p; });
  need.forEach((id) => { PEOPLE[id] = PEOPLE[id] || { user_id: id, name: '', avatar_url: null, bio: '', status: '' }; });
}
const statusOf = (id) => (PEOPLE[id] && PEOPLE[id].status) || '';
const statusChip = (id) => (statusOf(id) ? `<span class="cm-status">${esc(statusOf(id))}</span>` : '');

function myCardHtml() {
  const uid = cloud.user.id;
  const me = PEOPLE[uid] || {};
  return `<div class="card cm-me"><button class="cm-av" data-cmuser="${uid}">${avatarHtml(uid, me.name || myName(), 'md')}</button>
    <div class="grow"><b>${esc(me.name || myName())}</b> ${statusChip(uid) || '<span class="muted small">设置状态</span>'}
      <div class="muted small">${me.bio ? esc(me.bio) : '写一句个性签名，让大家认识你'}</div></div>
    <button class="btn small ghost" data-stact="edit-profile">编辑资料</button></div>`;
}

let profDraft = null;
function openProfileEdit() {
  const uid = cloud.user.id;
  const me = PEOPLE[uid] || {};
  if (!profDraft) profDraft = { name: me.name || myName(), bio: me.bio || '', status: me.status || '', file: null, url: null };
  const d = profDraft;
  const photo = d.url || me.avatar_url;
  openSheet('编辑资料', `<div class="pf-photo">${photo ? `<img src="${esc(photo)}" alt="">` : avatarHtml(uid, d.name, 'lg')}
      <label class="btn small ghost">${photo ? '更换头像' : '上传头像'}<input type="file" id="pfAvatar" accept="image/*" hidden></label></div>
    <label>昵称</label><input id="pfName" maxlength="20" value="${esc(d.name)}">
    <label>个性签名</label><input id="pfBio" maxlength="80" placeholder="如：卧推 120 是今年的目标" value="${esc(d.bio)}">
    <label>当前状态</label>
    <div class="chips">${STATUS_PRESETS.map((s) => `<button class="chip${d.status === s ? ' on' : ''}" data-pfst="${esc(s)}">${esc(s)}</button>`).join('')}
      ${d.status ? '<button class="chip" data-pfst="">清除</button>' : ''}</div>
    <input id="pfStatus" maxlength="24" placeholder="或者自己写，如：🏋️ 备战 11 月比赛" value="${esc(d.status)}">
    <button class="btn block big" data-stact="save-profile" id="pfSave">保存</button>
    <p class="muted small">头像、昵称、签名和状态所有登录用户都能看到。</p>`, { type: 'stprof', reopen: openProfileEdit });
}
function readProf() {
  if (!profDraft || !$('#pfName')) return;
  profDraft.name = $('#pfName').value.trim(); profDraft.bio = $('#pfBio').value.trim(); profDraft.status = $('#pfStatus').value.trim();
}
async function saveProfile() {
  readProf();
  const d = profDraft;
  if (!d.name) return toast('昵称不能为空');
  const btn = $('#pfSave'); btn.disabled = true; btn.textContent = '保存中…';
  try {
    await ensureProfile();
    const uid = cloud.user.id;
    const patch = { name: d.name.slice(0, 20), bio: d.bio.slice(0, 80), status: d.status.slice(0, 24), status_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (d.file) {
      const blob = await compressImage(d.file, 512, 0.85);
      const path = `${uid}/avatar-${Date.now().toString(36)}.jpg`;
      const up = await cloud.client.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw up.error;
      patch.avatar_url = cloud.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }
    const { error } = await cloud.client.from('profiles').update(patch).eq('user_id', uid);
    if (error) throw error;
    state.profile.name = patch.name; save();
    if (social.me) social.me.name = patch.name;
    PEOPLE[uid] = { ...(PEOPLE[uid] || {}), user_id: uid, ...patch, avatar_url: patch.avatar_url || (PEOPLE[uid] || {}).avatar_url || null };
    if (d.url) URL.revokeObjectURL(d.url);
    profDraft = null;
    closeSheet(); render(); toast('资料已更新');
  } catch (err) {
    btn.disabled = false; btn.textContent = '保存';
    toast(isMissingTable(err) || /column|avatar|bio|status/i.test(err.message || '') ? '请先在 Supabase 运行 supabase/stories.sql' : `保存失败：${err.message || err}`);
  }
}

/** After the name changes in 我的 → 修改信息, update the public profile too. */
async function syncPublicProfile() {
  if (!socialReady()) return;
  try {
    await ensureProfile(); // renames the profile when state.profile.name changed
    const uid = cloud.user.id;
    if (PEOPLE[uid]) PEOPLE[uid].name = myName();
  } catch { /* offline or tables missing: synced next time */ }
}

/* ---------- stories ---------- */
async function loadStories() {
  if (!socialReady() || story.loading) return;
  story.loading = true;
  const { data, error } = await cloud.client.from('stories').select('*').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: true }).limit(300);
  story.loading = false;
  if (error) { story.loaded = true; story.list = []; story.missing = isMissingTable(error); return; }
  story.list = (data || []).filter((s) => !(state.blocked || []).includes(s.user_id));
  story.loaded = true;
  const lk = await cloud.client.from('story_likes').select('story_id').eq('user_id', cloud.user.id);
  story.liked = new Set(((lk && lk.data) || []).map((x) => x.story_id));
  await fetchPeople(story.list.map((s) => s.user_id).concat(cloud.user.id));
  if (currentView === 'friends') render();
}
const seen = () => state.seenStories || [];
function storyGroups() {
  const uid = cloud.user.id;
  const by = {};
  story.list.forEach((s) => (by[s.user_id] = by[s.user_id] || []).push(s));
  const ids = Object.keys(by).filter((id) => id !== uid);
  const rank = (id) => (comm.following.has(id) ? 0 : 1);
  ids.sort((a, b) => rank(a) - rank(b) || (by[b].slice(-1)[0].created_at > by[a].slice(-1)[0].created_at ? 1 : -1));
  const groups = ids.map((id) => ({ uid: id, items: by[id], unseen: by[id].some((s) => !seen().includes(s.id)) }));
  groups.sort((a, b) => (b.unseen ? 1 : 0) - (a.unseen ? 1 : 0));
  return { mine: by[uid] || [], groups };
}
function storiesRowHtml() {
  if (!story.loaded && !story.loading) setTimeout(loadStories, 0);
  if (story.missing) return '';
  const uid = cloud.user.id;
  const { mine, groups } = storyGroups();
  const nm = (id) => esc(((PEOPLE[id] && PEOPLE[id].name) || '健身er').slice(0, 6));
  return `<div class="st-row">
    <div class="st-item"><button class="st-ring${mine.length ? ' own' : ' none'}" data-st="${mine.length ? uid : 'add'}">${avatarHtml(uid, myName(), 'st')}</button>
      <label class="st-plus" aria-label="发快拍">＋<input type="file" id="stFile" accept="image/*" hidden></label><span>你的快拍</span></div>
    ${groups.map((g) => `<div class="st-item"><button class="st-ring${g.unseen ? '' : ' seen'}" data-st="${g.uid}">${avatarHtml(g.uid, nm(g.uid), 'st')}</button><span>${nm(g.uid)}</span></div>`).join('')}
  </div>`;
}

function openStoryDraft(file) {
  if (story.draft && story.draft.url) URL.revokeObjectURL(story.draft.url);
  story.draft = { file, url: URL.createObjectURL(file) };
  openSheet('发快拍', `<div class="st-preview"><img src="${story.draft.url}" alt=""></div>
    <input id="stCaption" maxlength="100" placeholder="说点什么（可不填）">
    <button class="btn block big" data-stact="post-story" id="stPost">发布 · 24 小时后自动消失</button>
    <p class="muted small">所有登录用户都能看到你的快拍。</p>`, { type: 'stnew' });
}
async function postStory() {
  const d = story.draft;
  const btn = $('#stPost'); btn.disabled = true; btn.textContent = '上传中…';
  try {
    const blob = await compressImage(d.file, 1080, 0.85);
    const path = `${cloud.user.id}/story-${Date.now().toString(36)}.jpg`;
    const up = await cloud.client.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw up.error;
    const url = cloud.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { error } = await cloud.client.from('stories').insert({ image_url: url, caption: ($('#stCaption').value || '').trim() });
    if (error) throw error;
    URL.revokeObjectURL(d.url); story.draft = null;
    closeSheet(); toast('快拍已发布，24 小时后自动消失');
    story.loaded = false; loadStories();
  } catch (err) {
    btn.disabled = false; btn.textContent = '发布 · 24 小时后自动消失';
    toast(isMissingTable(err) ? '请先在 Supabase 运行 supabase/stories.sql' : /too many/.test(err.message || '') ? '24 小时内最多发 20 条快拍' : `发布失败：${err.message || err}`);
  }
}

/* Full-screen story viewer: tap right = next, left = previous; auto-advance after 5 s */
const STORY_MS = 5000;
function openStories(uid) {
  const { mine, groups } = storyGroups();
  const order = uid === cloud.user.id ? [{ uid, items: mine }] : groups;
  let gi = Math.max(0, order.findIndex((g) => g.uid === uid));
  let ii = uid === cloud.user.id ? 0 : Math.max(0, order[gi].items.findIndex((s) => !seen().includes(s.id)));
  let el = $('#storyViewer');
  if (!el) { el = document.createElement('div'); el.id = 'storyViewer'; document.body.appendChild(el); }
  let timer = null;
  const close = () => { clearTimeout(timer); el.hidden = true; story.view = null; if (currentView === 'friends') render(); };
  const step = (dir) => {
    clearTimeout(timer);
    ii += dir;
    if (ii >= order[gi].items.length) { gi++; ii = 0; }
    if (ii < 0) { gi--; ii = gi >= 0 ? order[gi].items.length - 1 : 0; }
    if (gi < 0 || gi >= order.length) return close();
    draw();
  };
  const draw = () => {
    const g = order[gi], s = g.items[ii];
    if (!seen().includes(s.id)) { state.seenStories = seen().concat(s.id).slice(-500); save(); }
    const mine = g.uid === cloud.user.id;
    el.innerHTML = `<div class="sv-bars">${g.items.map((x, k) => `<i class="${k < ii ? 'done' : k === ii ? 'cur' : ''}"><b></b></i>`).join('')}</div>
      <div class="sv-head"><button class="sv-user" data-sv="user">${avatarHtml(g.uid, (PEOPLE[g.uid] || {}).name, 'xs')}<b>${esc((PEOPLE[g.uid] || {}).name || '健身er')}</b></button><span>${relTime(s.created_at)}</span>${statusChip(g.uid)}
        <span class="grow"></span>${mine ? '<button data-sv="del">删除</button>' : '<button data-sv="report">举报</button>'}<button data-sv="close" aria-label="关闭">✕</button></div>
      <img src="${esc(s.image_url)}" alt="">
      ${s.caption ? `<div class="sv-cap">${esc(s.caption)}</div>` : ''}
      <button class="sv-prev" data-sv="-1" aria-label="上一条"></button><button class="sv-next" data-sv="1" aria-label="下一条"></button>
      <div class="sv-foot">${mine
        ? `<button class="sv-stats" data-sv="stats">${story.stats[s.id] ? `❤️ ${story.stats[s.id].likes} · 💬 ${story.stats[s.id].comments}` : '❤️ · 💬'} 查看</button>`
        : `<input id="svReply" maxlength="300" placeholder="回复 ${esc((PEOPLE[g.uid] || {}).name || 'TA')}…" autocomplete="off"><button data-sv="send" aria-label="发送">发送</button>
           <button class="sv-like${story.liked.has(s.id) ? ' on' : ''}" data-sv="like" aria-label="点赞">${story.liked.has(s.id) ? '❤️' : '🤍'}</button>`}</div>`;
    story.view = s;
    timer = setTimeout(() => step(1), STORY_MS);
    const inp = el.querySelector('#svReply');
    if (inp) {
      inp.addEventListener('focus', () => { clearTimeout(timer); el.classList.add('paused'); });
      inp.addEventListener('blur', () => { if (!inp.value.trim()) { el.classList.remove('paused'); clearTimeout(timer); timer = setTimeout(() => step(1), STORY_MS); } });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.querySelector('[data-sv=send]').click(); } });
    }
    if (mine) loadStoryStats(s.id).then(() => { const b = el.querySelector('.sv-stats'); if (b && story.view === s) b.textContent = `❤️ ${story.stats[s.id].likes} · 💬 ${story.stats[s.id].comments} 查看`; });
  };
  el.onclick = async (e) => {
    const b = e.target.closest('[data-sv]');
    if (!b) return;
    const a = b.dataset.sv;
    if (a === 'close') return close();
    if (a === 'del') {
      clearTimeout(timer);
      if (!confirm('删除这条快拍？')) { timer = setTimeout(() => step(1), STORY_MS); return; }
      const s = story.view;
      await cloud.client.from('stories').delete().eq('id', s.id);
      const path = storagePath(s.image_url); if (path) cloud.client.storage.from(BUCKET).remove([path]);
      story.list = story.list.filter((x) => x.id !== s.id);
      order[gi].items = order[gi].items.filter((x) => x.id !== s.id);
      toast('已删除');
      if (!order[gi].items.length) return close();
      ii = Math.min(ii, order[gi].items.length - 1); return draw();
    }
    if (a === 'report') { const s = story.view; close(); return openReport('story', s.id); }
    if (a === 'user') { const uid = order[gi].uid; close(); return openUser(uid); }
    if (a === 'stats') { const s = story.view; close(); return openStoryActivity(s); }
    if (a === 'like') {
      const s = story.view, on = story.liked.has(s.id);
      if (on) story.liked.delete(s.id); else story.liked.add(s.id);
      b.textContent = on ? '🤍' : '❤️'; b.classList.toggle('on', !on);
      const r = on ? await cloud.client.from('story_likes').delete().eq('story_id', s.id).eq('user_id', cloud.user.id)
        : await cloud.client.from('story_likes').insert({ story_id: s.id, user_id: cloud.user.id });
      if (r.error && !/duplicate/i.test(r.error.message)) toast(isMissingTable(r.error) ? '请先在 Supabase 运行 supabase/story_social.sql' : `操作失败：${r.error.message}`);
      return;
    }
    if (a === 'send') {
      const inp = el.querySelector('#svReply'), body = inp.value.trim(), s = story.view;
      if (!body) return;
      inp.disabled = true;
      await ensureProfile();
      const { error } = await cloud.client.from('story_comments').insert({ story_id: s.id, body });
      if (error) { inp.disabled = false; return toast(isMissingTable(error) ? '请先在 Supabase 运行 supabase/story_social.sql' : `发送失败：${error.message}`); }
      toast('已发送，只有 TA 能看到');
      el.classList.remove('paused');
      return step(1);
    }
    step(Number(a));
  };
  el.hidden = false;
  draw();
}

/* Your own story: who liked it and the replies (only you and each replier can see a reply) */
async function loadStoryStats(id) {
  const [l, c] = await Promise.all([
    cloud.client.from('story_likes').select('user_id').eq('story_id', id),
    cloud.client.from('story_comments').select('*').eq('story_id', id).order('created_at', { ascending: true }),
  ]);
  story.stats[id] = { likes: (l.data || []).length, comments: (c.data || []).length, likers: (l.data || []).map((x) => x.user_id), replies: c.data || [] };
  await fetchPeople(story.stats[id].likers.concat(story.stats[id].replies.map((r) => r.user_id)));
  return story.stats[id];
}
async function openStoryActivity(s) {
  const draw = () => {
    const st = story.stats[s.id];
    openSheet('快拍互动', `<div class="sa-head"><img src="${esc(s.image_url)}" alt=""><div><b>${st ? st.likes : '-'}</b> 个赞 · <b>${st ? st.comments : '-'}</b> 条回复<div class="muted small">${relTime(s.created_at)}发布 · 24 小时后消失</div></div></div>
      ${!st ? '<p class="muted">加载中…</p>' : `<h3>❤️ 点赞</h3>${st.likers.length ? `<div class="sa-likers">${st.likers.map((id) => `<button class="cm-av" data-cmuser="${id}" title="${esc((PEOPLE[id] || {}).name || '')}">${avatarHtml(id, (PEOPLE[id] || {}).name, 'sm')}</button>`).join('')}</div>` : '<p class="muted">还没有人点赞</p>'}
        <h3>💬 回复</h3>${st.replies.length ? st.replies.map((r) => `<div class="cm-cmt"><button class="cm-av" data-cmuser="${r.user_id}">${avatarHtml(r.user_id, r.author_name, 'xs')}</button>
          <div class="grow"><b>${esc(r.author_name || '健身er')}</b> <span class="muted small">${relTime(r.created_at)}</span><div>${esc(r.body)}</div></div>
          <button class="link small" data-sadel="${r.id}">删除</button></div>`).join('') : '<p class="muted">还没有回复</p>'}`}`, { type: 'cmstory', reopen: draw });
  };
  draw();
  await loadStoryStats(s.id);
  if (sheetCtx && sheetCtx.type === 'cmstory') draw();
  story.activity = s;
}

/* ---------- shared report sheet ---------- */
const REPORT_TABLE = { post: ['post_reports', 'post_id'], plan: ['plan_reports', 'plan_id'], story: ['story_reports', 'story_id'] };
function openReport(kind, id) {
  const reasons = (kind === 'plan' ? ['虚假/诈骗收款码'] : []).concat(REPORT_REASONS);
  openSheet('举报', `<p class="muted">选择举报原因，我们会尽快处理。</p>
    <textarea id="rpDetail" rows="2" maxlength="200" placeholder="补充说明（可不填）"></textarea>
    ${reasons.map((r) => `<button class="btn ghost block rp-btn" data-rp="${esc(r)}">${esc(r)}</button>`).join('')}`, { type: 'report', kind, id });
}
async function submitReport(reason) {
  const { kind, id } = sheetCtx;
  const [table, col] = REPORT_TABLE[kind];
  const detail = ($('#rpDetail').value || '').trim();
  closeSheet();
  const { error } = await cloud.client.from(table).insert({ [col]: id, user_id: cloud.user.id, reason: detail ? `${reason}：${detail}` : reason });
  if (error && /duplicate/i.test(error.message)) return toast('你已经举报过了，感谢反馈');
  if (error) return toast(`举报失败：${error.message}`);
  toast('已举报，感谢反馈');
}

function bindStories() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#view-friends [data-st], #view-friends [data-stact]');
    if (!b) return;
    if (b.dataset.st === 'add') return $('#stFile').click();
    if (b.dataset.st) return openStories(b.dataset.st);
    if (b.dataset.stact === 'edit-profile') { profDraft = null; return openProfileEdit(); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'stFile' && e.target.files[0]) openStoryDraft(e.target.files[0]);
    if (e.target.id === 'pfAvatar' && e.target.files[0] && profDraft) {
      readProf();
      if (profDraft.url) URL.revokeObjectURL(profDraft.url);
      profDraft.file = e.target.files[0]; profDraft.url = URL.createObjectURL(profDraft.file);
      refreshSheet();
    }
  });
  $('#sheet').addEventListener('click', (e) => {
    if (!sheetCtx) return;
    const b = e.target.closest('button');
    if (!b) return;
    const ds = b.dataset;
    if (sheetCtx.type === 'report' && ds.rp) return submitReport(ds.rp);
    if (sheetCtx.type === 'cmstory' && ds.sadel) {
      cloud.client.from('story_comments').delete().eq('id', ds.sadel).then(() => {
        const st = story.stats[story.activity.id];
        st.replies = st.replies.filter((r) => r.id !== ds.sadel); st.comments = st.replies.length;
        refreshSheet();
      });
      return;
    }
    if (sheetCtx.type === 'stnew' && ds.stact === 'post-story') return postStory();
    if (sheetCtx.type === 'stprof') {
      if (ds.pfst !== undefined) { readProf(); profDraft.status = ds.pfst; return refreshSheet(); }
      if (ds.stact === 'save-profile') return saveProfile();
    }
    if (sheetCtx.type === 'cmuser' && ds.stact === 'edit-profile') { profDraft = null; return openProfileEdit(); }
    if (sheetCtx.type === 'cmuser' && ds.st) { closeSheet(); return openStories(ds.st); }
  });
}
