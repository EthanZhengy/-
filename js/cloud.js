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
  // Coming back from Google: the result (session or error) is in the URL
  const params = new URLSearchParams(`${location.hash.replace(/^#/, '')}&${location.search.replace(/^\?/, '')}`);
  const urlError = params.get('error_description') || params.get('error');
  const fromOAuth = params.has('access_token') || params.has('code');
  const cleanUrl = () => window.history.replaceState(null, '', location.pathname);
  if (urlError) {
    cleanUrl();
    setTimeout(() => alert(`Google 登录没有成功：\n${urlError.replace(/\+/g, ' ')}\n\n请截图发给开发者，或先用邮箱登录。`), 300);
  } else if (fromOAuth) {
    setTimeout(() => toast('正在完成 Google 登录…'), 100);
    setTimeout(() => { if (!cloud.user) { cleanUrl(); alert('Google 登录没有完成，请重试。如果一直不行，请先用邮箱登录。'); } }, 8000);
  }
  cloud.client = window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.anonKey, {
    // implicit flow: the Google redirect brings the session back in the URL, picked up on load
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'ianz-auth' },
  });
  cloud.client.auth.onAuthStateChange((event, session) => {
    const prev = cloud.user && cloud.user.id;
    cloud.user = session ? session.user : null;
    if (cloud.user && /access_token|[?&]code=/.test(location.href)) window.history.replaceState(null, '', location.pathname);
    // Supabase advises against awaiting its own calls inside this callback
    if (cloud.user && cloud.user.id !== prev) setTimeout(cloudPull, 0);
    if (!cloud.user) cloud.status = 'off';
    if (cloud.user && sheetCtx && sheetCtx.type === 'login') closeSheet();
    if ((cloud.user && cloud.user.id) !== prev) render(); else cloudRefreshUi();
    // Accounts created with a one-time code must set a password once (asked again each launch until done)
    if (cloud.user && needsPassword() && !cloud.pwPrompted) { cloud.pwPrompted = true; setTimeout(() => openPasswordSheet(true), 600); }
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
  await reconcile();
  welcomeIfNew();
}
/** First sign-in with nothing set up yet: greet and go straight to the questionnaire (returning users are already home). */
function welcomeIfNew() {
  if (!cloud.user || state.onboarded) return;
  if (!wiz) startWizard(false);
  const meta = cloud.user.user_metadata || {};
  const name = (meta.full_name || meta.name || '').trim();
  if (name && !wiz.draft.profile.name) wiz.draft.profile.name = name;
  wiz.greet = name || wiz.draft.profile.name || '';
  if (wiz.step === 0) wiz.step = 1;
  render();
}
async function reconcile() {
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

const hasPassword = () => !!(cloud.user && cloud.user.user_metadata && cloud.user.user_metadata.has_password);
const signInProvider = () => (cloud.user && cloud.user.app_metadata && cloud.user.app_metadata.provider) || 'email';
// Only code-based accounts need a password; Google accounts sign in with Google
const needsPassword = () => !!cloud.user && ['email', 'phone'].includes(signInProvider()) && !hasPassword();
const GOOGLE_LOGO = '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

async function googleLogin() {
  const { error } = await cloud.client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
  });
  if (error) toast(`Google 登录失败：${error.message}`);
}

function accountCard() {
  if (!cloudEnabled()) return '';
  if (!cloud.user) {
    return `<div class="card account"><div class="row between"><h2>登录 / 注册</h2><span class="tag">云端保存</span></div>
      <p class="muted">用邮箱${CLOUD_CONFIG.phone ? '或手机号' : ''}登录，数据自动保存到云端，换手机、删了 App 也不会丢。</p>
      <button class="btn block" data-act="login">登录 / 注册</button></div>`;
  }
  const st = syncText();
  return `<div class="card account"><div class="row between"><h2>云端账号</h2><span class="sync ${cloud.status}">${esc(st)}</span></div>
    <div class="kv"><span>账号</span><b>${esc(accountLabel())}</b></div>
    <div class="kv"><span>登录方式</span><b>${signInProvider() === 'google' ? 'Google 账号' : signInProvider() === 'phone' ? '手机号' : '邮箱'}</b></div>
    ${signInProvider() === 'google' ? '' : `<div class="kv"><span>登录密码</span><b>${hasPassword() ? '已设置' : '<span class="warn-text">未设置</span>'}</b></div>
    <button class="btn block ${hasPassword() ? 'ghost' : ''}" data-act="set-password">${hasPassword() ? '修改密码' : '设置登录密码'}</button>`}
    <div class="row wrap" style="margin-top:12px"><button class="btn small ghost" data-act="sync-now">立即同步</button>
      <button class="btn small ghost" data-act="logout">退出登录</button>
      <button class="btn small danger" data-act="delete-cloud">删除云端数据</button></div></div>`;
}

/* ---------- sign in: one-time code or password ---------- */
let login = { method: 'code', mode: 'email', target: '', sent: false };
function openLoginSheet() {
  const left = Math.max(0, Math.ceil((cloud.cooldownUntil - Date.now()) / 1000));
  const targetInput = `<label>${login.mode === 'email' ? '邮箱' : '手机号（中国大陆）'}</label>
    <div class="row">${login.mode === 'phone' ? '<span class="prefix">+86</span>' : ''}
      <input id="loginTarget" class="grow" ${login.mode === 'email' ? 'type="email" inputmode="email" placeholder="you@example.com" autocomplete="username"' : 'type="tel" inputmode="numeric" placeholder="手机号" autocomplete="username"'} value="${esc(login.target)}">
      ${login.method === 'code' ? `<button class="btn small" data-act="send-code" ${left ? 'disabled' : ''}>${left ? `${left}s` : login.sent ? '重新发送' : '发送验证码'}</button>` : ''}</div>`;
  const body = login.method === 'code'
    ? `${targetInput}
      ${login.sent ? `<label>验证码</label><input id="loginCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="输入收到的验证码">
        <button class="btn block" data-act="verify-code">登录</button>
        <p class="muted">${login.mode === 'email' ? '没收到？看看垃圾邮件文件夹。' : '验证码几分钟内有效。'}</p>` : ''}
      <p class="muted">第一次使用会自动注册，注册后需要设置一个登录密码。</p>`
    : `${targetInput}
      <label>密码</label><input id="loginPassword" type="password" autocomplete="current-password" placeholder="登录密码">
      <button class="btn block" data-act="password-login">登录</button>
      <p class="muted">还没有账号或忘记密码？<button class="link" data-login-method="code">用验证码登录</button>，登录后可以重新设置密码。</p>`;
  openSheet('登录 / 注册', `
    ${CLOUD_CONFIG.google ? `<button class="btn block google" data-act="google-login">${GOOGLE_LOGO}使用 Google 账号登录</button>
      <div class="or"><span>或使用邮箱</span></div>` : ''}
    <div class="seg">${[['code', '验证码登录'], ['password', '密码登录']].map(([k, l]) => `<button data-login-method="${k}" class="${login.method === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${CLOUD_CONFIG.phone ? `<div class="utabs left">${[['email', '邮箱'], ['phone', '手机号']].map(([k, l]) => `<button data-login-mode="${k}" class="${login.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
    ${body}`, { type: 'login', reopen: openLoginSheet });
}
const loginTarget = () => (login.mode === 'phone' ? `+86${login.target.replace(/\D/g, '')}` : login.target.trim().toLowerCase());
const targetCredential = () => (login.mode === 'email' ? { email: loginTarget() } : { phone: loginTarget() });
function readTarget() {
  login.target = $('#loginTarget').value.trim();
  if (login.mode === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(login.target)) { toast('请输入正确的邮箱'); return false; }
  if (login.mode === 'phone' && !/^1\d{10}$/.test(login.target.replace(/\D/g, ''))) { toast('请输入 11 位手机号'); return false; }
  return true;
}

async function sendCode() {
  if (!readTarget()) return;
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
  cloud.pwPrompted = true; // asked right below instead of from the auth listener
  const { data, error } = await cloud.client.auth.verifyOtp({ ...targetCredential(), token, type: login.mode === 'email' ? 'email' : 'sms' });
  if (error) { cloud.pwPrompted = false; return toast(`登录失败：${error.message}`); }
  login = { method: 'code', mode: login.mode, target: '', sent: false };
  if (data && data.user) cloud.user = data.user;
  if (!hasPassword()) return openPasswordSheet(true);
  closeSheet();
  toast('登录成功，正在同步数据');
}
async function passwordLogin() {
  if (!readTarget()) return;
  const password = $('#loginPassword').value;
  if (!password) return toast('请输入密码');
  cloud.pwPrompted = true;
  const { error } = await cloud.client.auth.signInWithPassword({ ...targetCredential(), password });
  if (error) {
    cloud.pwPrompted = false;
    return toast(/invalid/i.test(error.message) ? '账号或密码不正确（还没设置过密码的话，请用验证码登录）' : `登录失败：${error.message}`);
  }
  login = { method: 'password', mode: login.mode, target: '', sent: false };
  closeSheet();
  toast('登录成功，正在同步数据');
}

/* ---------- password: at least 12 characters with a letter, a digit and a special character ---------- */
const PW_RULES = [
  ['至少 12 位', (p) => p.length >= 12],
  ['包含字母', (p) => /[A-Za-z]/.test(p)],
  ['包含数字', (p) => /\d/.test(p)],
  ['包含特殊字符（如 !@#$%&*）', (p) => /[^A-Za-z0-9\s]/.test(p)],
];
const pwRulesHtml = (p) => PW_RULES.map(([label, ok]) => `<li class="${ok(p) ? 'ok' : ''}">${ok(p) ? '✓' : '○'} ${label}</li>`).join('');

function openPasswordSheet(first) {
  if (!cloud.user) return;
  openSheet(first ? '设置登录密码' : hasPassword() ? '修改密码' : '设置登录密码', `
    ${first ? `<p class="muted">注册成功！为账号 <b>${esc(accountLabel())}</b> 设置一个密码，以后可以直接用密码登录，不用每次收验证码。</p>` : ''}
    <label>新密码</label><input id="pw1" type="password" autocomplete="new-password" placeholder="至少 12 位">
    <ul class="pw-rules" id="pwRules">${pwRulesHtml('')}</ul>
    <label>再输入一次</label><input id="pw2" type="password" autocomplete="new-password" placeholder="确认密码">
    <button class="btn block" data-act="save-password">保存密码</button>
    ${first ? '<button class="btn ghost block" data-act="skip-password">稍后设置</button><p class="muted">稍后设置的话，下次打开 App 会再提醒你。</p>' : ''}`,
  { type: 'password', first });
}
async function savePassword() {
  const p1 = $('#pw1').value, p2 = $('#pw2').value;
  const bad = PW_RULES.find(([, ok]) => !ok(p1));
  if (bad) return toast(`密码需要${bad[0].replace(/（.*）/, '')}`);
  if (p1 !== p2) return toast('两次输入的密码不一致');
  const { data, error } = await cloud.client.auth.updateUser({ password: p1, data: { has_password: true } });
  if (error) {
    return toast(/reauth|recent/i.test(error.message) ? '为了安全，请先退出并用验证码重新登录，再修改密码' : `保存失败：${error.message}`);
  }
  if (data && data.user) cloud.user = data.user;
  closeSheet();
  toast('密码已设置，以后可以用密码登录');
  render();
}

function bindCloud() {
  $('#sheet').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !sheetCtx) return;
    if (sheetCtx.type === 'login') {
      if (b.dataset.loginMethod) { login.method = b.dataset.loginMethod; login.sent = false; openLoginSheet(); }
      else if (b.dataset.loginMode) { login = { method: login.method, mode: b.dataset.loginMode, target: '', sent: false }; openLoginSheet(); }
      else if (b.dataset.act === 'send-code') sendCode();
      else if (b.dataset.act === 'verify-code') verifyCode();
      else if (b.dataset.act === 'password-login') passwordLogin();
      else if (b.dataset.act === 'google-login') googleLogin();
    } else if (sheetCtx.type === 'password') {
      if (b.dataset.act === 'save-password') savePassword();
      else if (b.dataset.act === 'skip-password') { closeSheet(); toast('登录成功，正在同步数据'); }
    }
  });
  $('#sheet').addEventListener('input', (e) => {
    if (e.target.id === 'pw1') $('#pwRules').innerHTML = pwRulesHtml(e.target.value);
  });
  $('#sheet').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !sheetCtx) return;
    if (e.target.id === 'loginPassword') passwordLogin();
    else if (e.target.id === 'loginCode') verifyCode();
    else if (e.target.id === 'pw2') savePassword();
  });
  // account buttons live on the 我的 page and on the questionnaire's welcome step
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#view-me button, #view-wizard button');
    if (!b || !cloud.client) return;
    const a = b.dataset.act;
    if (a === 'login') openLoginSheet();
    else if (a === 'set-password') openPasswordSheet(false);
    else if (a === 'sync-now') cloudPull();
    else if (a === 'logout') cloudSignOut();
    else if (a === 'delete-cloud') cloudDeleteData();
  });
}
