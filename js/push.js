'use strict';
/*
 * Lock-screen push reminders (Web Push), the app-icon badge and deep links (?go=…).
 * Push: this device subscribes, and stores the next 14 days of reminders in public.push_subs; the
 * send-reminders Edge Function delivers them on time even when the app is closed (supabase/push.sql).
 */

const pushKey = () => (typeof CLOUD_CONFIG !== 'undefined' && CLOUD_CONFIG.vapidPublicKey) || '';
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!pushKey();
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function b64ToU8(s) {
  const raw = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** The next 14 days of reminders, as absolute times (the server only compares timestamps). */
function pushSchedule() {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), i);
    remindersFor(d).forEach((r) => {
      const [h, m] = r.time.split(':').map(Number);
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
      if (at <= now) return;
      const url = /^今天练|开始训练/.test(r.title) ? './?go=workout' : /^该吃/.test(r.title) ? './?go=food' : './';
      out.push({ at: at.toISOString(), title: r.title, body: r.body, url, tag: `${dateKey(d)}-${r.time}` });
    });
  }
  return out.slice(0, 80);
}

async function currentSub() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
async function savePushSub(sub) {
  const j = sub.toJSON();
  const { error } = await cloud.client.from('push_subs').upsert({
    endpoint: j.endpoint, user_id: cloud.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth,
    schedule: pushSchedule(), enabled: true, user_agent: navigator.userAgent.slice(0, 200), updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function enablePush() {
  if (!pushSupported()) return toast(isIOS() && !isStandalone() ? 'iPhone 需要先「添加到主屏幕」，从主屏幕图标打开后再开启' : '这个浏览器不支持推送');
  if (!cloud.user) return toast('请先登录账号，推送需要云端帮你按时发送');
  if (!(await requestNotify())) return toast('没有获得通知权限，请在系统设置里允许 Ianz Fitness 的通知');
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(pushKey()) });
    await savePushSub(sub);
    state.reminders.push = true; save(); render();
    toast('已开启锁屏推送 🔔');
  } catch (err) {
    toast(isMissingTable(err) ? '请先在 Supabase 运行 supabase/push.sql' : `开启失败：${err.message || err}`);
  }
}
async function disablePush() {
  try {
    const sub = await currentSub();
    if (sub) {
      if (cloud.user) await cloud.client.from('push_subs').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch { /* already gone */ }
  state.reminders.push = false; save(); render();
  toast('已关闭锁屏推送');
}
/** Keep the server's copy of the schedule fresh (plan changes, a workout done early, new reminder times). */
let pushTimer = null;
function syncPushSoon() {
  if (!state.reminders || !state.reminders.push || !cloud.user || !pushSupported()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try { const sub = await currentSub(); if (sub) await savePushSub(sub); } catch { /* retry on next change */ }
  }, 8000);
}
async function testPush() {
  // Shows the notification locally through the service worker, exactly like a pushed one
  if (!(await requestNotify())) return toast('未获得通知权限');
  const r = remindersFor(new Date())[0];
  const reg = await navigator.serviceWorker.ready;
  reg.showNotification(r.title, { body: r.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './?go=workout' } });
}

function pushCardHtml() {
  const on = !!state.reminders.push;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  let hint = '';
  if (!pushKey()) hint = '推送还没有配置（缺少 VAPID 公钥）。';
  else if (isIOS() && !isStandalone()) hint = 'iPhone：先用 Safari「分享 → 添加到主屏幕」，再从主屏幕图标打开 App 开启。需要 iOS 16.4 或更新。';
  else if (!('PushManager' in window)) hint = '这个浏览器不支持推送。';
  else if (!cloud.user) hint = '需要先登录账号：推送由云端按时发送。';
  else if (perm === 'denied') hint = '通知权限被拒绝了，请到手机「设置 → 通知 → Ianz Fitness」打开。';
  return `<div class="card"><h2>🔔 锁屏推送</h2>
    <p class="muted">App 关着也能收到：每天${esc(state.reminders.morning)}告诉你今天练什么、多重${state.reminders.meals ? '，以及训练前和每一餐的提醒' : ''}。时间和内容跟上面的设置一致。</p>
    ${hint ? `<p class="warn">${hint}</p>` : ''}
    <button class="btn block ${on ? 'ghost' : ''}" data-act="${on ? 'push-off' : 'push-on'}">${on ? '关闭锁屏推送' : '开启锁屏推送'}</button>
    ${on ? '<button class="btn small ghost block" data-act="push-test">看看推送长什么样</button>' : ''}</div>`;
}

/* ---------- app-icon badge: 1 while today's training is not done ---------- */
function updateBadge() {
  if (!('setAppBadge' in navigator) || !state.onboarded) return;
  try {
    const t = todayInfo();
    const pending = t.pos && t.sid !== 'rest' && !t.log.done;
    (pending ? navigator.setAppBadge(1) : navigator.clearAppBadge()).catch(() => {});
  } catch { /* badge is best-effort */ }
}

/* ---------- deep links: ./?go=workout | free | tpl | food | weight | cardio | community | library | history | me ---------- */
const DEEP_LINKS = [['workout', '开始今天的训练'], ['free', '新建训练'], ['tpl', '训练模板'], ['food', '记饮食'], ['weight', '记体重'], ['cardio', '记有氧'], ['community', '社区']];
function handleDeepLink() {
  const go = new URLSearchParams(location.search).get('go');
  if (!go || !state.onboarded || wiz) return;
  history.replaceState(null, '', location.pathname);
  wkMode = 'plan';
  if (go === 'workout') currentView = 'workout';
  else if (go === 'free') { startFree(); currentView = 'workout'; }
  else if (go === 'community') return openFriends();
  else if (['library', 'history', 'me', 'challenge'].includes(go)) currentView = go;
  else { currentView = 'home'; homeTab = go === 'food' ? 'food' : 'today'; }
  render(); window.scrollTo(0, 0);
  if (go === 'tpl') openTemplates();
  else if (go === 'weight') openWeightSheet();
  else if (go === 'cardio') openCardio();
}
const appUrl = (go) => `${location.origin}${location.pathname}?go=${go}`;
function shortcutsGuideHtml() {
  return `<div class="card"><h2>快捷指令小组件（iPhone）</h2>
    <p class="muted">用 iPhone 自带的「快捷指令」，可以在桌面放一个按钮小组件，一点直达对应页面：</p>
    <ol class="tips"><li>打开「快捷指令」→ 右上角 ＋ → 添加操作，搜索「打开 URL」</li>
      <li>把下面的链接粘贴进去，给快捷指令起个名字（如「开始训练」），选个图标</li>
      <li>长按桌面空白处 → 左上角 ＋ → 找到「快捷指令」小组件，选中号（4 个按钮）放到桌面</li></ol>
    ${DEEP_LINKS.map(([go, l]) => `<div class="row between dl-row"><span>${l}</span><button class="btn tiny ghost" data-copy-link="${go}">复制链接</button></div>`).join('')}
    <p class="muted small">注意：iPhone 的快捷指令会用 Safari 打开链接，而不是主屏幕上的 App。登录同一个账号后数据是一样的。</p></div>`;
}
function bindPush() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#view-me button');
    if (!b) return;
    if (b.dataset.act === 'push-on') enablePush();
    else if (b.dataset.act === 'push-off') disablePush();
    else if (b.dataset.act === 'push-test') testPush();
    else if (b.dataset.copyLink) copyText(appUrl(b.dataset.copyLink), '链接已复制，粘贴到快捷指令的「打开 URL」里');
  });
}
