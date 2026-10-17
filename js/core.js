'use strict';
/* Shared state, helpers, reminders and calendar export. */

const APP_VERSION = '1.28.1';
const STORAGE_KEY = 'trainer-531-v2';
const ALL_EQUIP = Object.keys(EQUIPMENT);
const GYM_EQUIP = ALL_EQUIP.filter((e) => e !== 'ssb');
const HOME_EQUIP = ['barbell', 'rack', 'bench', 'dumbbell', 'pullup', 'band'];

function defaultState() {
  return {
    onboarded: false,
    program: '531', // active training program (see PROGRAMS); other programs' start date / schedule / tests live in programs[id]
    programs: {},
    mike: { bench1RM: 0, cg1RM: 0, variant: 'pause' },
    profile: { name: '', sex: 'male', age: 25, height: 175, weight: 70, activity: 1.35, goal: 'bulk' },
    lifts: {
      press: { variant: 'ohp', oneRM: 0 }, deadlift: { variant: 'conv_dl', oneRM: 0 },
      bench: { variant: 'bb_bench', oneRM: 0 }, squat: { variant: 'bb_squat', oneRM: 0 },
    },
    plateInc: 2.5,
    equipment: GYM_EQUIP.slice(),
    injuries: [], favorites: [], excluded: [], customEx: [], lastW: {}, restPref: {}, tplEx: {}, tplLastPick: {}, blocked: [], customDays: {}, seenStories: [], appearance: { mode: 'dark', accent: 'volt' },
    schedule: [0, 1, 3, 4],
    trainTime: '18:30',
    startDate: dateKey(mondayOf(new Date())),
    tests: {}, logs: {}, bodyweight: {},
    reminders: { enabled: false, morning: '07:30', meals: false, push: false },
    // updatedAt: last local change; syncedAt: last successful cloud upload; owner: account the data belongs to
    meta: { updatedAt: 0, syncedAt: 0, owner: null },
    wizStep: 0, // questionnaire progress before the plan is set up
  };
}
/** Fill in fields added in later versions so older saved data keeps working. */
function normalizeState(s) {
  const d = defaultState();
  return { ...d, ...s, profile: { ...d.profile, ...s.profile }, lifts: { ...d.lifts, ...s.lifts },
    reminders: { ...d.reminders, ...s.reminders }, meta: { ...d.meta, ...s.meta }, mike: { ...d.mike, ...s.mike } };
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return s ? normalizeState(s) : defaultState();
  } catch { return defaultState(); }
}
let state = loadState();

/* 字体: web fonts are split by character range, so only the glyphs on screen are downloaded */
const FONTS = {
  system: { name: '默认黑体', css: [] },
  kai: { name: '霞鹜文楷', css: ['https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.7.0/lxgwwenkaigbscreen.css'] },
  serif: { name: '思源宋体', css: ['https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@5.3.1/400.css', 'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@5.3.1/700.css'] },
  round: { name: '站酷快乐体', css: ['https://cdn.jsdelivr.net/npm/@fontsource/zcool-kuaile@5.3.0/400.css'] },
};
/** 饮食功能: 'on' | 'collapsed' (home card folded to one line) | 'off' (hidden everywhere, restore in 我的 → 营养目标) */
const dietMode = () => state.dietMode || 'on';
const dietOn = () => dietMode() !== 'off';
const FONT_SCALES = [[0.8, '特小'], [0.9, '小'], [1, '标准'], [1.1, '大'], [1.2, '特大'], [1.3, '超大']];
const LINE_HEIGHTS = [[1.25, '紧凑'], [1.4, '标准'], [1.6, '宽松'], [1.8, '特宽'], [2, '超宽']];
function loadFontCss(font) {
  (FONTS[font] || FONTS.system).css.forEach((href) => {
    if (document.querySelector(`link[data-font-css="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.dataset.fontCss = href;
    document.head.appendChild(l);
  });
}

/** 外观: dark / light / follow the system, accent color, font, text size and line spacing. Mirrored to localStorage for the pre-paint script in index.html. */
function applyTheme() {
  const a = state.appearance || {};
  const mode = a.mode || 'dark';
  const dark = mode === 'auto' ? matchMedia('(prefers-color-scheme: dark)').matches : mode === 'dark';
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.accent = a.accent || 'volt';
  const font = FONTS[a.font] ? a.font : 'system';
  root.dataset.font = font;
  root.dataset.num = a.numFont === 'system' ? 'system' : 'display';
  root.style.setProperty('--ui-zoom', String(a.scale || 1));
  const lh = a.lineHeight || 1.4;
  root.style.setProperty('--lh', String(lh));
  root.style.setProperty('--lh-k', (lh / 1.4).toFixed(3));
  loadFontCss(font);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#0d0e10' : '#f1f2ee';
  try { localStorage.setItem('ianz-theme', JSON.stringify({ mode, accent: a.accent || 'volt', splash: a.splash !== false, font, num: root.dataset.num, scale: a.scale || 1, lh, css: FONTS[font].css })); } catch { /* private mode */ }
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if ((state.appearance || {}).mode === 'auto') applyTheme(); });
/** Persist locally, then (when signed in) sync to the cloud shortly after. */
function save() {
  state.meta.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (typeof cloudPushSoon === 'function') cloudPushSoon();
  if (typeof syncPushSoon === 'function') syncPushSoon();
}
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}
function logFor(key) {
  if (!state.logs[key]) state.logs[key] = { sets: {}, amrap: {}, swaps: {}, meals: {}, water: 0 };
  const l = state.logs[key];
  l.sets = l.sets || {}; l.amrap = l.amrap || {}; l.swaps = l.swaps || {}; l.meals = l.meals || {};
  l.sx = l.sx || {}; l.extra = l.extra || {};
  return l;
}
const sessionName = (s, week) => (s === 'rest' ? '休息' : isCustomDay(s) ? (customDay(state, s) || {}).name || '自定义训练日'
  : LIFT_NAMES[s] && week === 12 ? `${LIFT_NAMES[s]}测试` : SESSION_LABEL[s]);
const chip = (label, attrs, on, extra = '') => `<button class="chip${on ? ' on' : ''}${extra}" ${attrs}>${label}</button>`;
function macrosHtml(n) {
  return `<div class="macros">
    <div class="macro"><b>${n.kcal}</b><span class="muted">千卡</span></div>
    <div class="macro p"><b>${n.protein}g</b><span class="muted">蛋白质</span></div>
    <div class="macro c"><b>${n.carbs}g</b><span class="muted">碳水</span></div>
    <div class="macro f"><b>${n.fat}g</b><span class="muted">脂肪</span></div></div>`;
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ================= Reminders ================= */

function remindersFor(date) {
  const rec = recommend(state, date);
  const log = state.logs[dateKey(date)];
  const sid = (log && log.session) || rec.session;
  const pos = position(state, date);
  const kind = sid === 'rest' || !pos ? 'rest' : LOWER[sid] ? 'lower' : 'upper';
  const n = nutritionFor(state, kind);
  const nut = !dietOn() ? '' : `\n营养：${n.kcal}千卡 · 蛋白${n.protein}g · 碳水${n.carbs}g · 脂肪${n.fat}g · 水${n.water}ml`;
  const list = [];
  if (sid === 'rest' || !pos) list.push({ time: state.reminders.morning, title: '今天休息 🧘', body: `${rec.reason}${nut}` });
  else {
    list.push({ time: state.reminders.morning, title: `今天练：${sessionName(sid, pos.week)} 💪（第${pos.week}周）`, body: `${sessionSummary(state, date, sid, 'normal')}${nut}` });
    if (state.reminders.meals) list.push({ time: fromMin(toMin(state.trainTime) - 15), title: '15 分钟后开始训练', body: sessionName(sid, pos.week) });
  }
  if (state.reminders.meals && dietOn()) mealsFor(state, n).forEach((m) => list.push({ time: m.time, title: `该吃${m.name}了`, body: `${m.food}\n≈蛋白 ${m.protein}g · 碳水 ${m.carbs}g · 脂肪 ${m.fat}g` }));
  return list;
}
async function requestNotify() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}
async function notify(title, body) {
  const opts = { body, icon: 'icons/icon.svg', tag: title };
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) return reg.showNotification(title, opts); } catch { /* fall back */ }
  new Notification(title, opts);
}
let timers = [];
function scheduleReminders() {
  timers.forEach(clearTimeout); timers = [];
  if (!state.onboarded || !state.reminders.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  remindersFor(now).forEach((r) => {
    const delay = (toMin(r.time) - nowMin) * 60000 - now.getSeconds() * 1000;
    if (delay > 0) timers.push(setTimeout(() => notify(r.title, r.body), delay));
  });
  const midnight = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
  timers.push(setTimeout(() => { scheduleReminders(); render(); }, midnight - now + 5000));
}

/** RFC 5545 line folding at 75 UTF-8 bytes. */
function foldLine(line) {
  const enc = new TextEncoder();
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
function exportIcs() {
  const pad = (n) => String(n).padStart(2, '0');
  const ie = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ianz-fitness//CN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Ianz Fitness'];
  const today = new Date();
  for (let i = 0; i < 28; i++) {
    const date = addDays(today, i);
    const pos = position(state, date);
    if (!pos) continue;
    // Future days follow the fixed schedule; today follows what you picked
    const sid = i === 0 ? (state.logs[dateKey(date)]?.session || recommend(state, date).session) : scheduledFor(state, date, pos.week);
    if (!sid || sid === 'rest') continue;
    const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
    const [h, m] = state.trainTime.split(':');
    const end = fromMin(toMin(state.trainTime) + 90).split(':');
    const n = nutritionFor(state, LOWER[sid] ? 'lower' : 'upper');
    const title = `${sessionName(sid, pos.week)}（第${pos.week}周 ${weekName(pos.week)}）`;
    const body = `${sessionSummary(state, date, sid, 'normal')}\n营养：${n.kcal}千卡 · 蛋白${n.protein}g · 碳水${n.carbs}g · 脂肪${n.fat}g`;
    lines.push('BEGIN:VEVENT', `UID:${ymd}-531@trainer`, `DTSTAMP:${stamp}`, `DTSTART:${ymd}T${h}${m}00`,
      toMin(state.trainTime) + 90 < 1440 ? `DTEND:${ymd}T${end[0]}${end[1]}00` : `DTEND:${ymd}T235900`,
      `SUMMARY:${ie(title)}`, `DESCRIPTION:${ie(body)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${ie(title)}`, `TRIGGER:-PT${Math.max(0, toMin(state.trainTime) - toMin(state.reminders.morning))}M`, 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  download(`IanzFitness训练-${dateKey(today)}.ics`, lines.map(foldLine).join('\r\n'), 'text/calendar');
  toast('已导出，用手机打开文件导入日历');
}

/* ================= Icons ================= */
const svgI = (body, fill = true) => `<svg class="ic" viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${body}</svg>`;
const ICONS = {
  train: svgI('<path fill-rule="evenodd" d="M9 2.5h6a1 1 0 0 1 1 1V5h2a2 2 0 0 1 2 2v12.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2V3.5a1 1 0 0 1 1-1zM8 10.2v1.8h8v-1.8zm0 4v1.8h8v-1.8z"/>'),
  challenge: svgI('<path d="M12 2.2l2.95 6.3 6.85.75-5.1 4.65 1.42 6.8L12 17.25 5.88 20.7l1.42-6.8L2.2 9.25l6.85-.75z"/>'),
  library: svgI('<circle cx="15.5" cy="4" r="2.2"/><path d="M13.2 7.1 9 8.6l-2.1 4 1.8.9 1.6-2.9 1.4-.5-1.3 4.7-3.6 3.7 1.5 1.4 4.1-4.1.9.2.7 4.8h2.1l-.9-6.3-1.3-1.5 1-3.4 1.1 1.9 3.6 1-.4-2.1-2.4-.8-1.8-3.4z"/>'),
  history: svgI('<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.1 4.5v7.1h5.6v-2h-3.5V6.5z"/>'),
  me: svgI('<circle cx="12" cy="7.6" r="4.6"/><path d="M3.2 21.5c.8-4.8 4.4-7.6 8.8-7.6s8 2.8 8.8 7.6z"/>'),
  search: svgI('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>', false),
  plus: svgI('<path d="M12 5v14M5 12h14"/>', false),
  back: svgI('<path d="M15 5l-7 7 7 7"/>', false),
  close: svgI('<path d="M6 6l12 12M18 6 6 18"/>', false),
  addUser: svgI('<circle cx="10" cy="7.5" r="4"/><path d="M2.5 20.5c.7-4 3.7-6.5 7.5-6.5 1.6 0 3 .4 4.2 1.2"/><path d="M18.5 14v7M15 17.5h7"/>', false),
  contacts: svgI('<circle cx="9" cy="7.5" r="4"/><path d="M1.5 20.5c.7-4 3.7-6.5 7.5-6.5s6.8 2.5 7.5 6.5z"/><path d="M17 5h5M17 9h5M18.5 13H22"/>'),
  feed: svgI('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.2c1.9 0 3.6.7 5 1.8l-3.9 3.6L9.6 4.6c.8-.3 1.6-.4 2.4-.4zM4.6 9.6l5.2 1.9-3.6 3.9a7.8 7.8 0 0 1-1.6-5.8zm5.8 10.2-1.9-5.2 3.9 3.6-2 1.6zm4-1.6-3.6-3.9 5.2-1.9v5.8zm1.7-7.6-1.9-5.2a7.8 7.8 0 0 1 4.8 6.6z"/>'),
  gear: svgI('<path fill-rule="evenodd" d="M10.3 2h3.4l.6 2.6 1.6.9 2.5-.9 1.7 2.9-2 1.8v1.8l2 1.8-1.7 2.9-2.5-.9-1.6.9-.6 2.6h-3.4l-.6-2.6-1.6-.9-2.5.9-1.7-2.9 2-1.8v-1.8l-2-1.8 1.7-2.9 2.5.9 1.6-.9zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>'),
  chevron: svgI('<path d="M9 5l7 7-7 7"/>', false),
  bell: svgI('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', false),
  calc: svgI('<rect x="5" y="2.5" width="14" height="19" rx="3"/><rect x="8" y="5.5" width="8" height="4" rx="1"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01"/>', false),
  body: svgI('<circle cx="12" cy="4.5" r="2.2"/><path d="M5 8.5h14M12 8.5v5.5M9 21l3-7 3 7"/>', false),
  food: svgI('<path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M8 8c0-2 1-3 1-5M12 8c0-2 1-3 1-5M16 8c0-2 1-3 1-5"/>', false),
  plan: svgI('<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 2.5v3M16 2.5v3M4 9.5h16M8 13.5h3M8 17h6"/>', false),
  data: svgI('<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>', false),
  info: svgI('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', false),
  bars: svgI('<path d="M5 20V12M12 20V5M19 20v-9M3 20.5h18"/>', false),
  phone: svgI('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>', false),
  cloud: svgI('<path d="M7 18.5a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 10z"/>', false),
  logout: svgI('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/>', false),
  breakfast: svgI('<path d="M6 10.2A3.6 3.6 0 0 1 7 3.5h10a3.6 3.6 0 0 1 1 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19z"/><path d="M9.5 12.5h5"/>', false),
  lunch: svgI('<circle cx="14.5" cy="12" r="6.5"/><path d="M4 3.5v6m2.5-6v6M3.5 9.5h3.5M5.2 9.5v11"/>', false),
  dinner: svgI('<path d="M3 18.5h18M5 18.5a7 7 0 0 1 14 0M12 9.5V7.5m-2.2 0h4.4"/>', false),
  snack: svgI('<path d="M12 7.5c-3-2-7.5 0-7.5 5s3 8 5.2 8c1 0 1.6-.6 2.3-.6s1.3.6 2.3.6c2.2 0 5.2-3 5.2-8s-4.5-7-7.5-5z"/><path d="M12 7.5c0-2 1-3.6 3.2-4.2"/>', false),
  water: svgI('<path d="M6 3h12l-1.6 17.1a1 1 0 0 1-1 .9H8.6a1 1 0 0 1-1-.9z"/><path d="M8.5 8h7"/>', false),
  scale: svgI('<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><rect x="8" y="7" width="8" height="4" rx="2"/>', false),
};
/* Equipment glyphs used as exercise illustrations. */
const EQ_GLYPH = {
  barbell: svgI('<path d="M2 12h20M5 8.5v7M8 6.5v11M16 6.5v11M19 8.5v7"/>', false),
  dumbbell: svgI('<path d="M8.5 12h7M5.5 9v6M8.5 7v10M15.5 7v10M18.5 9v6"/>', false),
  cable: svgI('<path d="M6 3v18M18 3v18M6 5.5h12M12 5.5v8.5M9 14h6"/>', false),
  machine: svgI('<rect x="4" y="3" width="6" height="18" rx="1.5"/><path d="M10 8h8M14 8v8M12 16h7"/>', false),
  body: svgI('<circle cx="12" cy="4.8" r="2"/><path d="M12 7.5v6.5M7.5 10.5h9M12 14l-3 6M12 14l3 6"/>', false),
  band: svgI('<path d="M3.5 12c4.2-6 12.8-6 17 0-4.2 6-12.8 6-17 0z"/><path d="M8 12h8"/>', false),
  kettlebell: svgI('<path d="M8.5 9.5a3.5 3.5 0 1 1 7 0"/><circle cx="12" cy="15" r="5.5"/>', false),
  other: svgI('<circle cx="12" cy="12" r="8"/><path d="M4.5 10c3 1.5 12 1.5 15 0"/>', false),
};

/* ================= Bottom sheet ================= */
let sheetCtx = null;
function openSheet(title, html, ctx = {}) {
  sheetCtx = ctx;
  $('#sheet').innerHTML = `<div class="sheet-panel" role="dialog" aria-label="${esc(title)}">
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-round" data-sheet-close aria-label="关闭">${ICONS.close}</button></div>
    <div class="sheet-body">${html}</div></div>`;
  $('#sheet').hidden = false;
  document.body.classList.add('sheet-open');
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet').innerHTML = '';
  sheetCtx = null;
  document.body.classList.remove('sheet-open');
}
function refreshSheet() { if (sheetCtx && sheetCtx.reopen) sheetCtx.reopen(); }
