'use strict';
/*
 * 社区: Weibo-style posts with photos, likes, comments, follows and trending #话题#.
 * Lives in the 朋友 screen as the 社区 tab. Requires supabase/community.sql.
 * Posts are visible to every signed-in user; blocking is per device + account (state.blocked).
 */

ICONS.square = svgI('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v9a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 15.5z"/><path d="M8 8.5h8M8 12h5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>');
const comm = { mode: 'hot', topic: null, posts: [], liked: new Set(), following: new Set(), trending: [], comments: {}, loading: false, loaded: false, more: true, error: '', draft: null, viewing: null };
const BUCKET = 'post-images';
const TOPIC_SUGGEST = ['今日训练', '卧推', '深蹲', '硬拉', '531', '增肌', '减脂', '饮食打卡'];
const PAGE = 20;
const isMissingTable = (e) => e && (/42P01|PGRST20[25]/.test(e.code || '') || /does not exist|schema cache|Could not find the (table|function)/i.test(e.message || ''));

function relTime(iso) {
  const t = new Date(iso), s = (Date.now() - t) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 172800) return '昨天';
  return `${t.getMonth() + 1}月${t.getDate()}日`;
}
function richText(body) {
  return esc(body).replace(/#([^#\s]{1,20})#/g, (m, t) => `<button class="cm-tag" data-cmtopic="${t}">#${t}#</button>`).replace(/\n/g, '<br>');
}
const blocked = () => state.blocked || [];

/* ---------- data ---------- */
async function loadCommunity(append = false) {
  if (!socialReady() || comm.loading) return;
  comm.loading = true; comm.error = '';
  const c = cloud.client, uid = cloud.user.id;
  try {
    if (!append) {
      const [fo, tr] = await Promise.all([
        c.from('follows').select('followee').eq('follower', uid),
        c.rpc('trending_topics', { days: 7, lim: 12 }),
      ]);
      if (fo.error) throw fo.error;
      comm.following = new Set((fo.data || []).map((x) => x.followee));
      comm.trending = tr.error ? [] : tr.data || [];
    }
    let q = c.from('posts').select('*');
    if (comm.topic) q = q.contains('topics', [comm.topic]);
    if (comm.mode === 'follow') q = q.in('user_id', [...comm.following, uid]);
    if (comm.mode === 'hot' && !comm.topic) {
      q = q.gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()).order('like_count', { ascending: false }).order('created_at', { ascending: false });
      if (append) q = q.range(comm.posts.length, comm.posts.length + PAGE - 1); else q = q.limit(PAGE);
    } else {
      q = q.order('created_at', { ascending: false });
      if (append && comm.posts.length) q = q.lt('created_at', comm.posts[comm.posts.length - 1].created_at);
      q = q.limit(PAGE);
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []).filter((p) => !blocked().includes(p.user_id));
    comm.posts = append ? comm.posts.concat(rows) : rows;
    comm.more = (data || []).length === PAGE;
    await Promise.all([loadLikes(rows.map((p) => p.id)), fetchPeople(rows.map((p) => p.user_id).concat(uid))]);
    comm.loaded = true;
  } catch (err) {
    comm.error = isMissingTable(err) ? 'need-sql' : err.message || String(err);
  }
  comm.loading = false;
  if (currentView === 'friends') render();
}
async function loadLikes(ids) {
  if (!ids.length) return;
  const { data } = await cloud.client.from('post_likes').select('post_id').eq('user_id', cloud.user.id).in('post_id', ids);
  (data || []).forEach((x) => comm.liked.add(x.post_id));
}
function reloadCommunity() { comm.loaded = false; comm.posts = []; story.loaded = false; loadCommunity(); render(); }

async function toggleLike(id) {
  const p = comm.posts.find((x) => x.id === id) || (comm.viewing && comm.viewing.posts.find((x) => x.id === id));
  const on = comm.liked.has(id);
  // optimistic update
  if (on) comm.liked.delete(id); else comm.liked.add(id);
  [comm.posts, comm.viewing ? comm.viewing.posts : []].forEach((list) => list.filter((x) => x.id === id).forEach((x) => { x.like_count = Math.max(0, x.like_count + (on ? -1 : 1)); }));
  render(); if (sheetCtx && sheetCtx.type && sheetCtx.type.startsWith('cm')) refreshSheet();
  const r = on ? await cloud.client.from('post_likes').delete().eq('post_id', id).eq('user_id', cloud.user.id)
    : await cloud.client.from('post_likes').insert({ post_id: id, user_id: cloud.user.id });
  if (r.error && !/duplicate/i.test(r.error.message)) toast(`操作失败：${r.error.message}`);
  return p;
}
async function toggleFollow(uid) {
  const on = comm.following.has(uid);
  const r = on ? await cloud.client.from('follows').delete().eq('follower', cloud.user.id).eq('followee', uid)
    : await cloud.client.from('follows').insert({ follower: cloud.user.id, followee: uid });
  if (r.error && !/duplicate/i.test(r.error.message)) return toast(`操作失败：${r.error.message}`);
  if (on) comm.following.delete(uid); else comm.following.add(uid);
  toast(on ? '已取消关注' : '已关注');
  if (comm.viewing && comm.viewing.uid === uid && comm.viewing.profile) comm.viewing.profile.followers += on ? -1 : 1;
  render(); if (sheetCtx && sheetCtx.type === 'cmuser') refreshSheet();
}

/* ---------- photos ---------- */
function compressImage(file, max = 1440, quality = 0.84) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error('图片处理失败'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取这张图片')); };
    img.src = url;
  });
}
async function uploadPhotos(files) {
  const uid = cloud.user.id, stamp = Date.now().toString(36);
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const blob = await compressImage(files[i]);
    const path = `${uid}/${stamp}-${i}.jpg`;
    const { error } = await cloud.client.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    urls.push(cloud.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return urls;
}
const storagePath = (url) => { const i = url.indexOf(`/${BUCKET}/`); return i >= 0 ? decodeURIComponent(url.slice(i + BUCKET.length + 2)) : null; };

/* ---------- rendering ---------- */
function postHtml(p, opts = {}) {
  const uid = cloud.user.id;
  const mine = p.user_id === uid;
  const name = p.author_name || '健身er';
  const n = p.images.length;
  const imgs = n ? `<div class="cm-imgs n${Math.min(n, 3)}${n === 4 ? ' n4' : ''}">${p.images.map((u, i) => `<img src="${esc(u)}" alt="" loading="lazy" data-cmimg="${i}" data-post="${p.id}">`).join('')}</div>` : '';
  return `<article class="cm-post">
    <div class="cm-head"><button class="cm-av" data-cmuser="${p.user_id}">${avatarHtml(p.user_id, name, 'sm')}</button>
      <div class="grow"><button class="cm-name" data-cmuser="${p.user_id}">${esc(name)}${mine ? ' <span class="muted small">（我）</span>' : ''}</button> ${statusChip(p.user_id)}<div class="muted small">${relTime(p.created_at)}</div></div>
      ${mine ? '' : `<button class="cm-follow${comm.following.has(p.user_id) ? ' on' : ''}" data-cmfollow="${p.user_id}">${comm.following.has(p.user_id) ? '已关注' : '＋ 关注'}</button>`}</div>
    ${p.body ? `<div class="cm-body"${opts.full ? '' : ` data-cmopen="${p.id}"`}>${richText(p.body)}</div>` : ''}
    ${imgs}
    <div class="cm-actions"><button class="${comm.liked.has(p.id) ? 'on' : ''}" data-cmlike="${p.id}">${comm.liked.has(p.id) ? '❤️' : '🤍'} ${p.like_count || '赞'}</button>
      <button data-cmopen="${p.id}">💬 ${p.comment_count || '评论'}</button>
      <button data-cmmore="${p.id}" aria-label="更多">⋯</button></div>
  </article>`;
}

function communityHtml() {
  if (!comm.loaded && !comm.loading && !comm.error) setTimeout(loadCommunity, 0);
  if (comm.error === 'need-sql') {
    return `<h1 class="fr-h1">社区</h1><div class="card"><h2>社区功能还差一步</h2>
      <p class="muted">数据库里还没有社区的表。请在 Supabase → SQL Editor 运行仓库里的 <b>supabase/community.sql</b>（会同时创建图片存储桶），然后回来刷新。</p>
      <button class="btn block" data-cmact="reload">重新加载</button></div>`;
  }
  const tabs = `<div class="utabs left cm-tabs">${[['hot', '热门'], ['follow', '关注'], ['new', '最新']].map(([k, l]) => `<button data-cmmode="${k}" class="${comm.mode === k && !comm.topic ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const topics = comm.trending.length ? `<div class="cm-trend"><span>🔥 热门话题</span>${comm.trending.map((t, i) => `<button data-cmtopic="${esc(t.topic)}" class="${comm.topic === t.topic ? 'on' : ''}"><i>${i + 1}</i>#${esc(t.topic)}#<small>${t.posts}</small></button>`).join('')}</div>` : '';
  const topicHead = comm.topic ? `<div class="card cm-topic-head"><div class="grow"><b>#${esc(comm.topic)}#</b><div class="muted small">话题下的全部动态</div></div>
    <button class="btn small" data-cmact="post-topic">参与话题</button><button class="icon-round" data-cmact="clear-topic" aria-label="退出话题">${ICONS.close}</button></div>` : '';
  let list;
  if (!comm.loaded) list = `<div class="card center"><p class="muted">${comm.error ? `加载失败：${esc(comm.error)}` : '加载中…'}</p>${comm.error ? '<button class="btn block" data-cmact="reload">重试</button>' : ''}</div>`;
  else if (!comm.posts.length) {
    list = `<div class="card center fr-empty"><div class="fr-hero">${comm.mode === 'follow' && !comm.topic ? '👀' : '📝'}</div>
      <h2>${comm.mode === 'follow' && !comm.topic ? '关注的人还没有发动态' : '还没有动态'}</h2>
      <p class="muted">${comm.mode === 'follow' && !comm.topic ? '去「热门」看看，关注感兴趣的人。' : '发第一条，晒晒今天的训练吧！'}</p>
      <button class="btn block" data-cmact="compose">发动态</button></div>`;
  } else {
    list = comm.posts.map((p) => postHtml(p)).join('')
      + (comm.more ? `<button class="btn ghost block" data-cmact="more">${comm.loading ? '加载中…' : '加载更多'}</button>` : '<p class="muted center pad">- 没有更多了 -</p>');
  }
  return `<div class="row between"><h1 class="fr-h1">社区</h1><button class="icon-round" data-cmact="reload" aria-label="刷新">↻</button></div>
    ${myCardHtml()}${storiesRowHtml()}
    ${tabs}${topics}${topicHead}${list}
    <button class="cm-compose" data-cmact="compose" aria-label="发动态">✎</button>`;
}

/* ---------- sheets ---------- */
function openCompose(prefill = '') {
  if (!comm.draft) comm.draft = { text: prefill, files: [], urls: [] };
  else if (prefill && !comm.draft.text.includes(prefill)) comm.draft.text = `${comm.draft.text}${prefill}`;
  const d = comm.draft;
  const t = todayInfo();
  const res = t.log.done && t.log.result ? t.log.result : t.log.free && t.log.free.done && t.log.free.result;
  openSheet('发动态', `<textarea id="cmText" rows="5" maxlength="2000" placeholder="分享你的训练、饮食和感受… 用 #话题# 参与讨论">${esc(d.text)}</textarea>
    <div class="cm-pick">${d.urls.map((u, i) => `<span class="cm-thumb"><img src="${u}" alt=""><button data-cmrm="${i}" aria-label="删除图片">×</button></span>`).join('')}
      ${d.files.length < 9 ? `<label class="cm-add">＋<span>照片</span><input type="file" id="cmFile" accept="image/*" multiple hidden></label>` : ''}</div>
    <div class="chips">${TOPIC_SUGGEST.map((x) => `<button class="chip" data-cmins="#${x}#">#${x}#</button>`).join('')}</div>
    ${res ? '<button class="btn ghost block" data-cmact="insert-workout">📋 插入今天的训练</button>' : ''}
    <button class="btn block big" data-cmact="publish" id="cmPublish">发布</button>
    <p class="muted small">所有登录用户都能看到你的动态。请勿发布他人隐私或违规内容。发布即表示同意<a href="terms.html" target="_blank">《用户协议》</a>。</p>`, { type: 'cmnew', reopen: () => openCompose() });
}
function readDraft() { if (comm.draft && $('#cmText')) comm.draft.text = $('#cmText').value; }
function todayWorkoutText() {
  const t = todayInfo();
  if (t.log.done && t.log.result) {
    const r = t.log.result;
    return `\n#今日训练# ${sessionName(t.log.session, t.pos ? t.pos.week : 1)}：${r.variant}${r.top ? ` 最重 ${fmtW(r.top.w)}kg×${r.top.reps}` : ''}，${r.sets} 组，容量 ${(r.volume / 1000).toFixed(2)} 吨`;
  }
  const f = t.log.free && t.log.free.result;
  return f ? `\n#今日训练# ${f.title}：${f.names.slice(0, 4).join('、')}，${f.done} 组，${f.minutes} 分钟` : '';
}
async function publish() {
  readDraft();
  const d = comm.draft;
  const body = d.text.trim();
  if (!body && !d.files.length) return toast('写点什么或选几张照片吧');
  const btn = $('#cmPublish');
  if (btn) { btn.disabled = true; btn.textContent = d.files.length ? '上传照片中…' : '发布中…'; }
  try {
    await ensureProfile();
    const images = d.files.length ? await uploadPhotos(d.files) : [];
    const { error } = await cloud.client.from('posts').insert({ body, images });
    if (error) throw error;
    d.urls.forEach((u) => URL.revokeObjectURL(u));
    comm.draft = null;
    closeSheet();
    toast('发布成功 🎉');
    if (comm.mode === 'hot' && !comm.topic) comm.mode = 'new';
    reloadCommunity();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = '发布'; }
    toast(isMissingTable(err) || /bucket/i.test(err.message || '') ? '请先在 Supabase 运行 supabase/community.sql' : `发布失败：${err.message || err}`);
  }
}

function findPost(id) { return comm.posts.find((x) => x.id === id) || (comm.viewing && comm.viewing.posts.find((x) => x.id === id)); }
async function openPost(id) {
  const p = findPost(id);
  if (!p) return;
  const cs = comm.comments[id];
  openSheet('动态详情', `${postHtml(p, { full: true })}
    <h3>评论 ${p.comment_count || ''}</h3>
    <div class="cm-comments">${!cs ? '<p class="muted">加载中…</p>' : cs.length ? cs.map((c) => `<div class="cm-cmt">${avatarHtml(c.user_id, c.author_name, 'xs')}
      <div class="grow"><b>${esc(c.author_name || '健身er')}</b> <span class="muted small">${relTime(c.created_at)}</span><div>${esc(c.body)}</div></div>
      ${c.user_id === cloud.user.id || p.user_id === cloud.user.id ? `<button class="link small" data-cmdelc="${c.id}">删除</button>` : ''}</div>`).join('') : '<p class="muted">还没有评论，来说两句吧。</p>'}</div>
    <div class="cm-reply"><input id="cmReply" maxlength="500" placeholder="写评论…"><button class="btn small" data-cmsend="${id}">发送</button></div>`, { type: 'cmpost', id, reopen: () => openPost(id) });
  if (!cs) {
    const { data, error } = await cloud.client.from('post_comments').select('*').eq('post_id', id).order('created_at', { ascending: true });
    comm.comments[id] = error ? [] : (data || []).filter((c) => !blocked().includes(c.user_id));
    await fetchPeople(comm.comments[id].map((c) => c.user_id));
    if (sheetCtx && sheetCtx.type === 'cmpost' && sheetCtx.id === id) refreshSheet();
  }
}
async function sendComment(id) {
  const inp = $('#cmReply');
  const body = inp.value.trim();
  if (!body) return;
  inp.disabled = true;
  await ensureProfile();
  const { data, error } = await cloud.client.from('post_comments').insert({ post_id: id, body }).select().single();
  if (error) { inp.disabled = false; return toast(`评论失败：${error.message}`); }
  comm.comments[id] = (comm.comments[id] || []).concat([data || { id: Date.now(), post_id: id, user_id: cloud.user.id, author_name: social.me ? social.me.name : '我', body, created_at: new Date().toISOString() }]);
  const p = findPost(id); if (p) p.comment_count++;
  render(); refreshSheet();
}
async function deleteComment(cid) {
  const id = sheetCtx.id;
  const { error } = await cloud.client.from('post_comments').delete().eq('id', cid);
  if (error) return toast(`删除失败：${error.message}`);
  comm.comments[id] = (comm.comments[id] || []).filter((c) => c.id !== cid);
  const p = findPost(id); if (p) p.comment_count = Math.max(0, p.comment_count - 1);
  render(); refreshSheet();
}

function openMore(id) {
  const p = findPost(id);
  if (!p) return;
  const mine = p.user_id === cloud.user.id;
  openSheet('更多', mine ? '<button class="btn danger block" data-cmdel="1">删除这条动态</button>'
    : `<button class="btn ghost block" data-cmreport="1">举报这条动态</button><button class="btn danger block" data-cmblock="1">屏蔽 ${esc(p.author_name || '这个人')}</button>
      <p class="muted">屏蔽后不再看到 TA 的动态和评论，可以在「权限设置」里恢复。</p>`, { type: 'cmmore', id });
}
async function deletePost(id) {
  if (!confirm('删除这条动态？')) return;
  const p = findPost(id);
  const { error } = await cloud.client.from('posts').delete().eq('id', id);
  if (error) return toast(`删除失败：${error.message}`);
  const paths = (p.images || []).map(storagePath).filter(Boolean);
  if (paths.length) cloud.client.storage.from(BUCKET).remove(paths);
  comm.posts = comm.posts.filter((x) => x.id !== id);
  if (comm.viewing) comm.viewing.posts = comm.viewing.posts.filter((x) => x.id !== id);
  closeSheet(); render(); toast('已删除');
}

async function openUser(uid) {
  if (!comm.viewing || comm.viewing.uid !== uid) comm.viewing = { uid, profile: null, posts: [] };
  const v = comm.viewing;
  const pr = v.profile;
  const me = uid === cloud.user.id;
  const live = story.list.some((s) => s.user_id === uid);
  openSheet(pr ? pr.name || '健身er' : '主页', `<div class="cm-profile">${live ? `<button class="st-ring" data-st="${uid}">${avatarHtml(uid, pr ? pr.name : '?', 'lg')}</button>` : avatarHtml(uid, pr ? pr.name : '?', 'lg')}
      <div class="grow"><b>${esc(pr ? pr.name || '健身er' : '')}</b> ${statusChip(uid)}
        ${pr && pr.bio ? `<div class="muted small">${esc(pr.bio)}</div>` : ''}
        <div class="cm-counts"><span><b>${pr ? pr.posts : '-'}</b>动态</span><span><b>${pr ? pr.followers : '-'}</b>粉丝</span><span><b>${pr ? pr.following : '-'}</b>关注</span></div></div>
      ${me ? '<button class="btn small ghost" data-stact="edit-profile">编辑资料</button>' : `<button class="cm-follow${comm.following.has(uid) ? ' on' : ''}" data-cmfollow="${uid}">${comm.following.has(uid) ? '已关注' : '＋ 关注'}</button>`}</div>
    ${v.posts.length ? v.posts.map((p) => postHtml(p)).join('') : `<p class="muted center pad">${pr ? '还没有发过动态' : '加载中…'}</p>`}`, { type: 'cmuser', uid, reopen: () => openUser(uid) });
  if (!pr) {
    const [a, b] = await Promise.all([
      cloud.client.rpc('community_profile', { uid }),
      cloud.client.from('posts').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(30),
    ]);
    v.profile = (a.data && a.data[0]) || { name: '', posts: 0, followers: 0, following: 0 };
    if (a.data && a.data[0]) PEOPLE[uid] = { ...(PEOPLE[uid] || {}), ...a.data[0] };
    v.posts = b.data || [];
    await loadLikes(v.posts.map((p) => p.id));
    if (sheetCtx && sheetCtx.type === 'cmuser' && sheetCtx.uid === uid) refreshSheet();
  }
}

/* Full-screen photo viewer */
function openViewer(postId, i) {
  const p = findPost(postId);
  if (!p) return;
  let k = Number(i);
  let el = $('#cmViewer');
  if (!el) { el = document.createElement('div'); el.id = 'cmViewer'; document.body.appendChild(el); }
  const draw = () => {
    el.innerHTML = `<img src="${esc(p.images[k])}" alt=""><span class="cm-vcount">${k + 1} / ${p.images.length}</span>
      ${p.images.length > 1 ? '<button class="cm-vprev" data-v="-1">‹</button><button class="cm-vnext" data-v="1">›</button>' : ''}`;
  };
  draw();
  el.hidden = false;
  el.onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (b) { k = (k + Number(b.dataset.v) + p.images.length) % p.images.length; draw(); return; }
    el.hidden = true;
  };
}

/* ---------- events ---------- */
function communityClick(b) {
  const ds = b.dataset;
  if (ds.cmmode) { comm.mode = ds.cmmode; comm.topic = null; reloadCommunity(); }
  else if (ds.cmtopic) { closeSheet(); comm.topic = ds.cmtopic; reloadCommunity(); window.scrollTo(0, 0); }
  else if (ds.cmact === 'clear-topic') { comm.topic = null; reloadCommunity(); }
  else if (ds.cmact === 'reload') { comm.error = ''; reloadCommunity(); }
  else if (ds.cmact === 'more') loadCommunity(true);
  else if (ds.cmact === 'compose') openCompose();
  else if (ds.cmact === 'post-topic') openCompose(`#${comm.topic}# `);
  else if (ds.cmlike) toggleLike(ds.cmlike);
  else if (ds.cmopen) openPost(ds.cmopen);
  else if (ds.cmmore) openMore(ds.cmmore);
  else if (ds.cmfollow) toggleFollow(ds.cmfollow);
  else if (ds.cmuser) openUser(ds.cmuser);
  else return false;
  return true;
}
function bindCommunity() {
  $('#view-friends').addEventListener('click', (e) => {
    const img = e.target.closest('[data-cmimg]');
    if (img) return openViewer(img.dataset.post, img.dataset.cmimg);
    const b = e.target.closest('button, [data-cmopen]');
    if (b) communityClick(b);
  });
  $('#sheet').addEventListener('click', (e) => {
    if (!sheetCtx || !String(sheetCtx.type).startsWith('cm')) return;
    const img = e.target.closest('[data-cmimg]');
    if (img) return openViewer(img.dataset.post, img.dataset.cmimg);
    const b = e.target.closest('button');
    if (!b) return;
    const ds = b.dataset;
    if (sheetCtx.type === 'cmnew') {
      if (ds.cmins) {
        const ta = $('#cmText'), pos = ta.selectionStart ?? ta.value.length;
        ta.value = `${ta.value.slice(0, pos)}${ds.cmins} ${ta.value.slice(pos)}`; ta.focus();
      } else if (ds.cmrm) { readDraft(); URL.revokeObjectURL(comm.draft.urls[ds.cmrm]); comm.draft.files.splice(ds.cmrm, 1); comm.draft.urls.splice(ds.cmrm, 1); refreshSheet(); }
      else if (ds.cmact === 'insert-workout') { const ta = $('#cmText'); ta.value += todayWorkoutText(); }
      else if (ds.cmact === 'publish') publish();
      return;
    }
    if (ds.cmsend) return sendComment(ds.cmsend);
    if (ds.cmdelc) return deleteComment(ds.cmdelc);
    if (sheetCtx.type === 'cmmore') {
      const id = sheetCtx.id, p = findPost(id);
      if (ds.cmdel) return deletePost(id);
      if (ds.cmreport) return openReport('post', id);
      if (ds.cmblock && confirm(`屏蔽 ${p.author_name || '这个人'}？`)) {
        state.blocked = [...new Set(blocked().concat(p.user_id))];
        save();
        comm.posts = comm.posts.filter((x) => x.user_id !== p.user_id);
        closeSheet(); render(); toast('已屏蔽');
      }
      return;
    }
    communityClick(b);
  });
  $('#sheet').addEventListener('change', (e) => {
    if (e.target.id !== 'cmFile' || !comm.draft) return;
    readDraft();
    const files = [...e.target.files].filter((f) => f.type.startsWith('image/')).slice(0, 9 - comm.draft.files.length);
    files.forEach((f) => { comm.draft.files.push(f); comm.draft.urls.push(URL.createObjectURL(f)); });
    refreshSheet();
  });
  $('#sheet').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'cmReply' && sheetCtx) sendComment(sheetCtx.id); });
}
