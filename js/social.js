'use strict';
/*
 * 朋友: add friends by code or invite link, a 3-day training feed with 💪 cheers, and sharing settings.
 * Friends only ever see workout summaries (title, number of exercises / sets, top set) — never body data,
 * nutrition or the full log. Requires supabase/friends.sql.
 */

const social = { tab: 'square', me: null, friends: [], incoming: [], outgoing: [], feed: [], cheers: [], profiles: {}, loading: false, loaded: false, error: '' };
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
const socialReady = () => !!(cloud.client && cloud.user);
const myName = () => (state.profile.name || (cloud.user && cloud.user.user_metadata && cloud.user.user_metadata.full_name) || (cloud.user && cloud.user.email || '').split('@')[0] || '我').slice(0, 30);
const inviteLink = () => `${location.origin}${location.pathname}?add=${social.me ? social.me.friend_code : ''}`;
const AVATAR_COLORS = ['#1677ff', '#eb6834', '#1baf7a', '#6250d6', '#e34948', '#c98500'];
function avatarHtml(id, name, cls = '') {
  const c = AVATAR_COLORS[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return `<span class="f-avatar ${cls}" style="background:${c}">${esc((name || '?').slice(0, 1))}</span>`;
}
const nameOf = (id) => (social.profiles[id] && social.profiles[id].name) || '朋友';

/* ---------- data ---------- */

async function ensureProfile() {
  const uid = cloud.user.id;
  const { data, error } = await cloud.client.from('profiles').select('*').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  let me = data;
  for (let i = 0; !me && i < 5; i++) {
    const row = { user_id: uid, name: myName(), friend_code: genCode(), share_activity: true };
    const r = await cloud.client.from('profiles').insert(row);
    if (!r.error) me = row;
    else if (!/duplicate|unique/i.test(r.error.message)) throw r.error; // code taken → try another
  }
  if (me && me.name !== myName()) {
    await cloud.client.from('profiles').update({ name: myName(), updated_at: new Date().toISOString() }).eq('user_id', uid);
    me.name = myName();
  }
  social.me = me;
  return me;
}

async function loadSocial() {
  if (!socialReady()) return;
  social.loading = true; social.error = '';
  try {
    await ensureProfile();
    const uid = cloud.user.id;
    const { data: fr, error: e1 } = await cloud.client.from('friendships').select('*');
    if (e1) throw e1;
    const mine = (fr || []).filter((f) => f.requester === uid || f.addressee === uid);
    const other = (f) => (f.requester === uid ? f.addressee : f.requester);
    social.friends = mine.filter((f) => f.status === 'accepted').map(other);
    social.incoming = mine.filter((f) => f.status === 'pending' && f.addressee === uid).map((f) => f.requester);
    social.outgoing = mine.filter((f) => f.status === 'pending' && f.requester === uid).map((f) => f.addressee);
    social.profiles = { [uid]: social.me };
    const ids = [...new Set(mine.map(other))];
    if (ids.length) {
      const { data: ps, error: e2 } = await cloud.client.from('profiles').select('user_id, name').in('user_id', ids);
      if (e2) throw e2;
      (ps || []).forEach((p) => (social.profiles[p.user_id] = p));
    }
    const since = dateKey(addDays(new Date(), -2));
    const { data: acts, error: e3 } = await cloud.client.from('activities').select('*').gte('day', since).order('day', { ascending: false });
    if (e3) throw e3;
    social.feed = (acts || []).filter((a) => a.user_id === uid || social.friends.includes(a.user_id));
    const { data: ch, error: e4 } = await cloud.client.from('cheers').select('*').gte('activity_day', since);
    if (e4) throw e4;
    social.cheers = ch || [];
    social.loaded = true;
  } catch (err) {
    const msg = (err && err.message) || '';
    social.error = /relation|does not exist|schema cache|function/i.test(msg) ? 'need-sql' : msg || '加载失败';
  }
  social.loading = false;
  if (!wiz && (currentView === 'friends' || currentView === 'home')) render();
}

/** Called after each sign-in: create the profile and handle an invite link that was opened. */
async function socialAfterLogin() {
  try { await ensureProfile(); } catch { return; }
  handlePendingInvite();
  loadSocial();
}

/** Share a finished in-app workout with friends (one summary per day); removed again on 撤销完成. */
async function postActivity(date, log) {
  if (!socialReady() || !social.me) return;
  const day = dateKey(date);
  const r = log.result;
  let row = null;
  if (log.done && !log.offline && SESSIONS[log.session] && r) {
    const pos = position(state, date);
    const s = buildSession(state, date, log.session, { readiness: log.readiness, swaps: (log.swaps || {})[log.session] || {} });
    row = {
      user_id: cloud.user.id, day,
      title: `${sessionName(log.session, pos.week)} · 第${pos.week}周`,
      exercises: s ? s.blocks.length : 0, sets: r.sets, volume: r.volume,
      top_set: r.top ? `${r.variant.replace(/（.*）/, '')} ${fmtW(r.top.w)}kg×${r.top.reps}` : '',
    };
  }
  const sig = row ? JSON.stringify(row) : 'none';
  if (log.posted === sig || (!row && !log.posted)) return;
  const res = row
    ? await cloud.client.from('activities').upsert(row)
    : await cloud.client.from('activities').delete().eq('user_id', cloud.user.id).eq('day', day);
  if (!res.error) { log.posted = row ? sig : undefined; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
}

async function findByCode(code) {
  const { data, error } = await cloud.client.rpc('find_profile_by_code', { code });
  if (error) throw error;
  return (data || [])[0] || null;
}
async function sendRequest(targetId) {
  const uid = cloud.user.id;
  if (targetId === uid) return toast('这是你自己的好友码');
  if (social.friends.includes(targetId)) return toast('你们已经是好友了');
  if (social.incoming.includes(targetId)) return acceptRequest(targetId);
  const { error } = await cloud.client.from('friendships').insert({ requester: uid, addressee: targetId, status: 'pending' });
  if (error && !/duplicate|unique/i.test(error.message)) return toast(`发送失败：${error.message}`);
  toast('好友请求已发送，等对方同意后就能一起练了');
  closeSheet();
  social.tab = 'contacts';
  await loadSocial();
}
async function acceptRequest(fromId) {
  const { error } = await cloud.client.from('friendships').update({ status: 'accepted' }).eq('requester', fromId).eq('addressee', cloud.user.id);
  if (error) return toast(`操作失败：${error.message}`);
  toast(`已添加 ${nameOf(fromId)} 为好友`);
  closeSheet();
  await loadSocial();
}
async function removeLink(id, ask) {
  if (ask && !confirm(ask)) return;
  const uid = cloud.user.id;
  await cloud.client.from('friendships').delete().eq('requester', uid).eq('addressee', id);
  await cloud.client.from('friendships').delete().eq('requester', id).eq('addressee', uid);
  await loadSocial();
}
async function toggleCheer(userId, day) {
  const uid = cloud.user.id;
  const mine = social.cheers.some((c) => c.activity_user === userId && c.activity_day === day && c.user_id === uid);
  const q = cloud.client.from('cheers');
  const { error } = mine
    ? await q.delete().eq('activity_user', userId).eq('activity_day', day).eq('user_id', uid)
    : await q.insert({ activity_user: userId, activity_day: day, user_id: uid });
  if (error) return toast(`操作失败：${error.message}`);
  if (mine) social.cheers = social.cheers.filter((c) => !(c.activity_user === userId && c.activity_day === day && c.user_id === uid));
  else social.cheers.push({ activity_user: userId, activity_day: day, user_id: uid });
  render();
}
async function setSharing(on) {
  const { error } = await cloud.client.from('profiles').update({ share_activity: on }).eq('user_id', cloud.user.id);
  if (error) return toast(`保存失败：${error.message}`);
  social.me.share_activity = on;
  toast(on ? '好友可以看到你的训练了' : '已停止向好友分享训练');
  render();
}

/* ---------- invite links: ?add=CODE ---------- */
const PENDING_INVITE = 'ianz-invite';
function captureInvite() {
  const code = new URLSearchParams(location.search).get('add');
  if (!code) return;
  try { sessionStorage.setItem(PENDING_INVITE, code.toUpperCase()); } catch { /* private mode */ }
  window.history.replaceState(null, '', location.pathname + location.hash);
}
function handlePendingInvite() {
  let code = null;
  try { code = sessionStorage.getItem(PENDING_INVITE); } catch { /* ignore */ }
  if (!code || !socialReady() || !state.onboarded) return;
  try { sessionStorage.removeItem(PENDING_INVITE); } catch { /* ignore */ }
  currentView = 'friends'; social.tab = 'contacts';
  render();
  openAddFriend(code);
}

/* ---------- UI ---------- */

function relDay(k) {
  const d = parseKey(k), diff = dayDiff(d, new Date());
  return `${k} (${diff === 0 ? '今天' : diff === 1 ? '昨天' : `${diff}天前`} - ${WEEKDAYS[weekdayIdx(d)]})`;
}

function renderFriends() {
  const root = $('#view-friends');
  const head = `<div class="fr-head"><span class="grow"></span>
    ${socialReady() && social.me ? `<button class="fr-add" data-act="add-friend">${ICONS.addUser}添加朋友</button>` : ''}</div>`;
  const nav = `<nav class="fr-nav">${[['square', '社区', 'square'], ['contacts', '联系人', 'contacts'], ['feed', '朋友圈', 'feed'], ['privacy', '权限设置', 'gear']].map(([k, l, i]) =>
    `<button data-ftab="${k}" class="${social.tab === k ? 'on' : ''}">${ICONS[i]}<span>${l}</span>${k === 'contacts' && social.incoming.length ? `<i class="dot-badge">${social.incoming.length}</i>` : ''}</button>`).join('')}</nav>`;
  let body;
  if (!cloudEnabled()) body = '<div class="card"><h2>朋友功能未开启</h2><p class="muted">需要先配置云端账号。</p></div>';
  else if (!cloud.user) {
    body = `<div class="card center fr-empty"><div class="fr-hero">🤝</div><h2>和朋友一起练</h2>
      <p class="muted">登录后可以加好友，互相看到训练、加油打气。</p><button class="btn block" data-act="login">登录 / 注册</button></div>`;
  } else if (social.error === 'need-sql') {
    body = `<div class="card"><h2>朋友功能还差一步</h2><p class="muted">数据库里还没有朋友功能的表。请在 Supabase → SQL Editor 运行仓库里的 <b>supabase/friends.sql</b>，然后回来刷新。</p>
      <button class="btn block" data-act="fr-reload">重新加载</button></div>`;
  } else if (!social.loaded) {
    body = `<div class="card center"><p class="muted">${social.error ? `加载失败：${esc(social.error)}` : '加载中…'}</p>${social.error ? '<button class="btn block" data-act="fr-reload">重试</button>' : ''}</div>`;
  } else body = { square: communityHtml, feed: feedHtml, contacts: contactsHtml, privacy: privacyHtml }[social.tab]();
  root.innerHTML = head + (cloud.user ? nav : '') + body;
}

function feedHtml() {
  const uid = cloud.user.id;
  const days = [0, 1, 2].map((i) => dateKey(addDays(new Date(), -i)));
  let html = '';
  days.forEach((k) => {
    const items = social.feed.filter((a) => a.day === k);
    if (!items.length) return;
    html += `<div class="fr-day"><span>${relDay(k)}</span><span>${items.length}人训练了</span></div>`;
    html += items.map((a) => {
      const cheers = social.cheers.filter((c) => c.activity_user === a.user_id && c.activity_day === a.day);
      const mine = cheers.some((c) => c.user_id === uid);
      const self = a.user_id === uid;
      return `<div class="fr-card">${avatarHtml(a.user_id, nameOf(a.user_id))}
        <div class="grow"><b class="fr-title">${esc(a.title)}</b>
          <div class="muted">${a.exercises}个动作 <span class="sep">|</span> ${a.sets}组${a.top_set ? ` <span class="sep">|</span> ${esc(a.top_set)}` : ''}</div></div>
        <div class="fr-side"><span class="muted">${self ? '我' : esc(nameOf(a.user_id))}</span>
          <button class="cheer${mine ? ' on' : ''}" ${self ? 'disabled' : `data-cheer="${a.user_id}" data-day="${a.day}"`}>💪${cheers.length ? ` ${cheers.length}` : ''}</button></div></div>`;
    }).join('');
  });
  if (!html) {
    html = `<div class="card center fr-empty"><div class="fr-hero">🏋️</div><h2>最近 3 天还没有训练</h2>
      <p class="muted">${social.friends.length ? '完成训练后会自动出现在这里，朋友也能看到。' : '加几个朋友，一起练、互相监督。'}</p>
      ${social.friends.length ? '' : '<button class="btn block" data-act="add-friend">添加朋友</button>'}</div>`;
  }
  return `<h1 class="fr-h1">朋友圈</h1>${html}<p class="muted center pad">- 朋友圈仅显示最近 3 天的训练 -</p>`;
}

function contactsHtml() {
  const row = (id, actions, note = '') => `<div class="fr-row">${avatarHtml(id, nameOf(id), 'sm')}<span class="grow">${esc(nameOf(id))}${note ? `<span class="muted"> · ${note}</span>` : ''}</span>${actions}</div>`;
  return `<h1 class="fr-h1">联系人</h1>
    <div class="card fr-me">${avatarHtml(cloud.user.id, social.me.name)}<div class="grow"><b>${esc(social.me.name)}</b><div class="muted">我的好友码</div>
      <div class="fr-code">${esc(social.me.friend_code)}</div></div>
      <div class="fr-me-actions"><button class="btn small" data-act="share-invite">邀请朋友</button><button class="btn small ghost" data-act="copy-code">复制好友码</button></div></div>
    ${social.incoming.length ? `<h3 class="sec-title sm">好友请求</h3><div class="card">${social.incoming.map((id) => row(id, `<button class="btn tiny" data-accept="${id}">同意</button><button class="btn tiny ghost" data-decline="${id}">忽略</button>`, '想加你为好友')).join('')}</div>` : ''}
    <h3 class="sec-title sm">我的好友 <span class="muted">${social.friends.length}</span></h3>
    <div class="card">${social.friends.length ? social.friends.map((id) => row(id, `<button class="btn tiny ghost" data-unfriend="${id}">删除</button>`)).join('') : '<p class="muted">还没有好友。把好友码或邀请链接发给朋友吧。</p>'}</div>
    ${social.outgoing.length ? `<h3 class="sec-title sm">等待对方同意</h3><div class="card">${social.outgoing.map((id) => row(id, `<button class="btn tiny ghost" data-cancel="${id}">撤回</button>`)).join('')}</div>` : ''}`;
}

function privacyHtml() {
  const on = social.me.share_activity;
  return `<h1 class="fr-h1">权限设置</h1>
    <div class="card"><label class="row check"><input type="checkbox" data-share ${on ? 'checked' : ''}> 向好友分享我的训练</label>
      <p class="muted">开启后，你在 App 里完成的训练会出现在好友的朋友圈：训练名称、动作数、组数和当天最重的一组。</p></div>
    <div class="card"><h2>好友永远看不到</h2><ul class="tips"><li>身高、体重、年龄等身体数据</li><li>饮食和营养记录</li><li>完整的训练记录和最大重量</li><li>你的邮箱</li></ul></div>
    <div class="card"><h2>好友码</h2><p class="muted">只有拿到你好友码或邀请链接的人才能向你发好友请求，而且需要你同意。</p></div>
    <div class="card"><h2>社区</h2><p class="muted">你在社区发的动态、评论、点赞和关注，所有登录用户都能看到。动态可以随时删除。</p>
      ${(state.blocked || []).length ? `<div class="row between"><span>已屏蔽 ${state.blocked.length} 人</span><button class="btn tiny ghost" data-act="unblock-all">全部解除屏蔽</button></div>` : '<p class="muted">没有屏蔽任何人。</p>'}</div>`;
}

function openAddFriend(prefill = '') {
  openSheet('添加朋友', `
    <label>输入朋友的好友码</label>
    <div class="row"><input id="frCode" class="grow" maxlength="6" autocapitalize="characters" placeholder="例如 K7Q3MX" value="${esc(prefill)}" style="text-transform:uppercase;letter-spacing:2px">
      <button class="btn small" data-act="find-code">查找</button></div>
    <div id="frFound"></div>
    <div class="or"><span>或者把你的好友码发给朋友</span></div>
    <div class="fr-code center">${social.me ? esc(social.me.friend_code) : ''}</div>
    <button class="btn ghost block" data-act="share-invite">分享邀请链接</button>`, { type: 'friend' });
  if (prefill) findAndShow(prefill);
}
async function findAndShow(code) {
  const out = $('#frFound');
  if (!/^[A-Z0-9]{6}$/i.test(code)) return toast('好友码是 6 位字母和数字');
  out.innerHTML = '<p class="muted">查找中…</p>';
  try {
    const p = await findByCode(code);
    if (!p) { out.innerHTML = '<p class="warn">没有找到这个好友码，请检查一下。</p>'; return; }
    social.profiles[p.user_id] = social.profiles[p.user_id] || p;
    const already = social.friends.includes(p.user_id);
    out.innerHTML = `<div class="fr-row found">${avatarHtml(p.user_id, p.name, 'sm')}<span class="grow"><b>${esc(p.name || '朋友')}</b></span>
      ${p.user_id === cloud.user.id ? '<span class="muted">这是你自己</span>' : already ? '<span class="muted">已是好友</span>'
        : `<button class="btn small" data-request="${p.user_id}">${social.incoming.includes(p.user_id) ? '同意好友请求' : '加为好友'}</button>`}</div>`;
  } catch (err) { out.innerHTML = `<p class="warn">查找失败：${esc(err.message)}</p>`; }
}
async function shareInvite() {
  const text = `一起用 Ianz Fitness 练 5/3/1 吧！我的好友码：${social.me.friend_code}`;
  if (navigator.share) { try { await navigator.share({ title: 'Ianz Fitness', text, url: inviteLink() }); return; } catch { /* cancelled */ } }
  copyText(`${text}\n${inviteLink()}`, '邀请链接已复制，发给朋友吧');
}
function copyText(text, msg) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(msg), () => prompt('复制下面的内容：', text));
}

function bindFriends() {
  const root = $('#view-friends');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const ds = b.dataset;
    if (ds.act === 'fr-back') { currentView = 'home'; render(); }
    else if (ds.ftab) { social.tab = ds.ftab; render(); window.scrollTo(0, 0); }
    else if (ds.act === 'add-friend') openAddFriend();
    else if (ds.act === 'fr-reload') { social.loaded = false; render(); loadSocial(); }
    else if (ds.act === 'share-invite') shareInvite();
    else if (ds.act === 'copy-code') copyText(social.me.friend_code, '好友码已复制');
    else if (ds.accept) acceptRequest(ds.accept);
    else if (ds.decline) removeLink(ds.decline);
    else if (ds.cancel) removeLink(ds.cancel);
    else if (ds.unfriend) removeLink(ds.unfriend, `删除好友 ${nameOf(ds.unfriend)}？`);
    else if (ds.cheer) toggleCheer(ds.cheer, ds.day);
    else if (ds.act === 'unblock-all') { state.blocked = []; save(); reloadCommunity(); toast('已全部解除屏蔽'); }
  });
  root.addEventListener('change', (e) => { if (e.target.dataset.share !== undefined) setSharing(e.target.checked); });
  $('#sheet').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !sheetCtx || sheetCtx.type !== 'friend') return;
    if (b.dataset.act === 'find-code') findAndShow($('#frCode').value.trim().toUpperCase());
    else if (b.dataset.act === 'share-invite') shareInvite();
    else if (b.dataset.request) sendRequest(b.dataset.request);
  });
  $('#sheet').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'frCode') findAndShow(e.target.value.trim().toUpperCase()); });
}

function openFriends() {
  currentView = 'friends';
  render(); window.scrollTo(0, 0);
  if (socialReady()) loadSocial();
}
