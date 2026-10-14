'use strict';
/*
 * Accounts & cloud sync (Supabase). Sign in with a one-time code sent by email (or SMS when enabled).
 * The whole app state is stored as one private row per user; the newest copy wins, and the user is
 * asked before an existing cloud copy and unrelated local data would overwrite each other.
 * Everything here is a no-op when js/config.js has no keys.
 */

const cloud = { client: null, user: null, status: 'off', error: '', timer: null, cooldownUntil: 0 };
const cloudEnabled = () => !!(CLOUD_CONFIG.url && CLOUD_CONFIG.anonKey && window.supabase);
const accountLabel = () => (cloud.user ? cloud.user.email || cloud.user.phone || '已登录' : '');

function cloudInit() {
  if (!cloudEnabled()) return;
  cloud.client = window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ianz-auth' },
  });
  cloud.client.auth.onAuthStateChange((event, session) => {
    const prev = cloud.user && cloud.user.id;
    cloud.user = session ? session.user : null;
    // Supabase advises against awaiting its own calls inside this callback
    if (cloud.user && cloud.user.id !== prev) setTimeout(cloudPull, 0);
    if (!cloud.user) cloud.status = 'off';
    if ((cloud.user && cloud.user.id) !== prev) render(); else cloudRefreshUi();
  });
  window.addEventListener('online', () => { if (cloud.user && state.meta.syncedAt < state.meta.updatedAt) cloudPush(); });
}

function cloudRefreshUi() {
  // In the questionnaire only the status line is refreshed, so typing is never interrupted
  if (wiz) { const el = $('#wizAccount'); if (el) el.innerHTML = wizAccountHtml(); return; }
  if (currentView === 'me') render();
}
function syncText() {
  return { syncing: '同步中…', synced: `已同步${state.meta.syncedAt ? ` · ${new Date(state.meta.syncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}`, error: cloud.error, off: '' }[cloud.status] || '';
}
function wizAccountHtml() {
  if (!cloud.user) return '';
  return `<div class="acct-line"><span class="ok">✓ 已登录</span> ${esc(accountLabel())}<span class="muted"> · 填写的内容会自动保存到账号${cloud.status === 'syncing' ? '（保存中…）' : ''}</span></div>`;
}
function cloudFail(error) {
  cloud.status = 'error';
  cloud.error = navigator.onLine === false ? '当前离线，联网后自动同步' : (error && error.message) || '同步失败';
  cloudRefreshUi();
}

/** Replace local data with the cloud copy. */
function applyRemote(remote) {
  state = normalizeState(remote);
  state.meta.owner = cloud.user.id;
  state.meta.syncedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  wiz = null;
  cloud.status = 'synced';
  render();
  scheduleReminders();
}

async function cloudPull() {
  if (!cloud.user) return;
  cloud.status = 'syncing'; cloudRefreshUi();
  const { data, error } = await cloud.client.from('user_data').select('data, updated_at').eq('user_id', cloud.user.id).maybeSingle();
  if (error) return cloudFail(error);
  const remote = data && data.data;
  if (!remote) return cloudPush(); // first sign-in: upload what is on this phone
  const remoteT = (remote.meta && remote.meta.updatedAt) || Date.parse(data.updated_at) || 0;
  const localT = state.meta.updatedAt || 0;
  const mine = state.meta.owner === cloud.user.id;
  if (!state.onboarded) {
    // Not set up on this phone yet: take the account's data (finished plan or questionnaire progress)
    return remote.onboarded || remoteT >= localT ? applyRemote(remote) : cloudPush();
  }
  if (mine) return remoteT > localT ? applyRemote(remote) : localT > remoteT ? cloudPush() : (cloud.status = 'synced', cloudRefreshUi());
  // This phone has data that was never linked to this account
  const when = new Date(remoteT).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (confirm(`这个账号在云端已有数据（${when} 更新）。\n\n「确定」：使用云端数据（替换这台手机上的数据）\n「取消」：用这台手机上的数据覆盖云端`)) applyRemote(remote);
  else cloudPush();
}

async function cloudPush() {
  clearTimeout(cloud.timer);
  if (!cloud.user) return;
  if (!state.onboarded && !state.wizStep) { cloud.status = 'synced'; return cloudRefreshUi(); }
  state.meta.owner = cloud.user.id;
  cloud.status = 'syncing'; cloudRefreshUi();
  const { error } = await cloud.client.from('user_data').upsert({
    user_id: cloud.user.id, data: state, updated_at: new Date(state.meta.updatedAt || Date.now()).toISOString(),
  });
  if (error) return cloudFail(error);
  state.meta.syncedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  cloud.status = 'synced'; cloud.error = '';
  cloudRefreshUi();
}
function cloudPushSoon() {
  if (!cloud.user) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(cloudPush, 1500);
}

async function cloudSignOut() {
  if (!confirm('退出登录？\n\n这台手机上的数据会被清除，云端数据保留，下次登录即可恢复。')) return;
  if (state.meta.syncedAt < state.meta.updatedAt) await cloudPush();
  if (cloud.status === 'error' && !confirm('最近的修改还没同步到云端，退出会丢失这些修改。仍然退出？')) return;
  await cloud.client.auth.signOut();
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  currentView = 'home';
  render();
}

async function cloudDeleteData() {
  if (!confirm('删除这个账号在云端保存的所有数据？这台手机上的数据不受影响。此操作不能撤销。')) return;
  const { error } = await cloud.client.from('user_data').delete().eq('user_id', cloud.user.id);
  if (error) return toast(`删除失败：${error.message}`);
  state.meta.owner = null; state.meta.syncedAt = 0;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  await cloud.client.auth.signOut();
  toast('云端数据已删除，已退出登录');
  render();
}

/* ---------- UI ---------- */

function accountCard() {
  if (!cloudEnabled()) return '';
  if (!cloud.user) {
    return `<div class="card account"><div class="row between"><h2>登录 / 注册</h2><span class="tag">云端保存</span></div>
      <p class="muted">用邮箱${CLOUD_CONFIG.phone ? '或手机号' : ''}验证码登录，数据自动保存到云端，换手机、删了 App 也不会丢。</p>
      <button class="btn block" data-act="login">验证码登录</button></div>`;
  }
  const st = syncText();
  return `<div class="card account"><div class="row between"><h2>云端账号</h2><span class="sync ${cloud.status}">${esc(st)}</span></div>
    <div class="kv"><span>账号</span><b>${esc(accountLabel())}</b></div>
    <div class="row wrap"><button class="btn small ghost" data-act="sync-now">立即同步</button>
      <button class="btn small ghost" data-act="logout">退出登录</button>
      <button class="btn small danger" data-act="delete-cloud">删除云端数据</button></div></div>`;
}

let login = { mode: 'email', target: '', sent: false };
function openLoginSheet() {
  const phoneOk = CLOUD_CONFIG.phone;
  const left = Math.max(0, Math.ceil((cloud.cooldownUntil - Date.now()) / 1000));
  openSheet('验证码登录', `
    ${phoneOk ? `<div class="utabs left">${[['email', '邮箱'], ['phone', '手机号']].map(([k, l]) => `<button data-login-mode="${k}" class="${login.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
    <label>${login.mode === 'email' ? '邮箱' : '手机号（中国大陆）'}</label>
    <div class="row">${login.mode === 'phone' ? '<span class="prefix">+86</span>' : ''}
      <input id="loginTarget" class="grow" ${login.mode === 'email' ? 'type="email" inputmode="email" placeholder="you@example.com" autocomplete="email"' : 'type="tel" inputmode="numeric" placeholder="手机号" autocomplete="tel"'} value="${esc(login.target)}">
      <button class="btn small" data-act="send-code" ${left ? 'disabled' : ''}>${left ? `${left}s` : login.sent ? '重新发送' : '发送验证码'}</button></div>
    ${login.sent ? `<label>验证码</label><input id="loginCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="输入收到的验证码">
      <button class="btn block" data-act="verify-code">登录</button>
      <p class="muted">${login.mode === 'email' ? '没收到？看看垃圾邮件文件夹。' : '验证码几分钟内有效。'}</p>` : ''}
    <p class="muted">第一次使用会自动注册。登录后，这台手机上的数据会和云端同步。</p>`, { type: 'login', reopen: openLoginSheet });
}
const loginTarget = () => (login.mode === 'phone' ? `+86${login.target.replace(/\D/g, '')}` : login.target.trim().toLowerCase());

async function sendCode() {
  login.target = $('#loginTarget').value.trim();
  if (login.mode === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(login.target)) return toast('请输入正确的邮箱');
  if (login.mode === 'phone' && !/^1\d{10}$/.test(login.target.replace(/\D/g, ''))) return toast('请输入 11 位手机号');
  const { error } = await cloud.client.auth.signInWithOtp(login.mode === 'email'
    ? { email: loginTarget(), options: { shouldCreateUser: true } }
    : { phone: loginTarget() });
  if (error) return toast(`发送失败：${error.message}`);
  login.sent = true;
  cloud.cooldownUntil = Date.now() + 60000;
  toast('验证码已发送');
  openLoginSheet();
  const tick = setInterval(() => {
    const btn = $('#sheet [data-act=send-code]');
    const left = Math.ceil((cloud.cooldownUntil - Date.now()) / 1000);
    if (!btn || left <= 0) { clearInterval(tick); if (btn) { btn.disabled = false; btn.textContent = '重新发送'; } return; }
    btn.textContent = `${left}s`;
  }, 1000);
  setTimeout(() => $('#loginCode') && $('#loginCode').focus(), 50);
}
async function verifyCode() {
  const token = ($('#loginCode').value || '').replace(/\s/g, '');
  if (!/^\d{6,10}$/.test(token)) return toast('请输入收到的数字验证码');
  const { error } = await cloud.client.auth.verifyOtp(login.mode === 'email'
    ? { email: loginTarget(), token, type: 'email' }
    : { phone: loginTarget(), token, type: 'sms' });
  if (error) return toast(`登录失败：${error.message}`);
  login = { mode: login.mode, target: '', sent: false };
  closeSheet();
  toast('登录成功，正在同步数据');
}

function bindCloud() {
  $('#sheet').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !sheetCtx || sheetCtx.type !== 'login') return;
    if (b.dataset.loginMode) { login = { mode: b.dataset.loginMode, target: '', sent: false }; openLoginSheet(); }
    else if (b.dataset.act === 'send-code') sendCode();
    else if (b.dataset.act === 'verify-code') verifyCode();
  });
  // account buttons live on the 我的 page and on the questionnaire's welcome step
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#view-me button, #view-wizard button');
    if (!b || !cloud.client) return;
    const a = b.dataset.act;
    if (a === 'login') openLoginSheet();
    else if (a === 'sync-now') cloudPull();
    else if (a === 'logout') cloudSignOut();
    else if (a === 'delete-cloud') cloudDeleteData();
  });
}
