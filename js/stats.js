'use strict';
/* Training history & analytics: completion status, offline (outside-the-app) sessions, volume, e1RM, streaks. */

if (typeof module !== 'undefined') Object.assign(globalThis, require('./engine.js'), require('./data.js'));

const firstInt = (s) => parseInt(String(s), 10) || 0;

/**
 * What was actually done in a session. In-app sessions count ticked sets (all sets if none
 * were ticked) and use AMRAP reps where entered; offline sessions assume the plan was completed.
 */
function summarizeSession(st, date, sid, log) {
  const s = buildSession(st, date, sid, { readiness: log.readiness, swaps: (log.swaps || {})[sid] || {} });
  if (!s) return null;
  const pos = s.pos;
  const main = s.blocks[0];
  const out = { lift: main.lift, variant: variantOf(st, main.lift).name, volume: 0, sets: 0, e1rm: null, top: null, test: null,
    exIds: [variantOf(st, main.lift).id].concat(s.test ? [] : [variantOf(st, SESSIONS[sid].secondary).id], s.blocks.filter((b) => b.ex).map((b) => b.ex.id)) };
  if (s.test) {
    const t = st.tests[pos.cycle] && st.tests[pos.cycle][main.lift];
    if (t) { out.test = t; out.e1rm = { value: t, w: t, reps: 1, src: 'test' }; out.top = { w: t, reps: 1 }; }
    return out;
  }
  const sets = (log.sets || {});
  const amrap = log.amrap || {};
  s.blocks.forEach((b) => {
    const ticks = sets[`${sid}:${b.key}`] || [];
    const any = !log.offline && ticks.some(Boolean);
    if (b.type === 'main') {
      b.rows.forEach((r, i) => {
        if (any && !ticks[i]) return;
        const a = amrap[`${sid}:main:${i}`];
        const reps = a || r.reps;
        out.volume += r.w * reps; out.sets++;
        if (!out.top || r.w > out.top.w) out.top = { w: r.w, reps };
        if (a) {
          const v = Math.round(epley(r.w, a) * 2) / 2;
          if (!out.e1rm || v > out.e1rm.value) out.e1rm = { value: v, w: r.w, reps: a, src: 'amrap' };
        }
      });
    } else {
      const n = any ? ticks.filter(Boolean).length : b.sets;
      out.sets += n;
      if (b.w) out.volume += b.w * firstInt(b.reps) * n;
    }
  });
  out.volume = Math.round(out.volume);
  return out;
}

/** Every completed session, oldest first. */
function history(st) {
  return Object.keys(st.logs).sort().map((k) => {
    const log = st.logs[k];
    if (!log.done || !SESSIONS[log.session]) return null;
    const date = parseKey(k);
    const pos = position(st, date);
    if (!pos) return null;
    const res = (!log.offline && log.result) || summarizeSession(st, date, log.session, log);
    return res && { key: k, date, pos, session: log.session, offline: !!log.offline, ...res };
  }).filter(Boolean);
}

/** Completion status of one session in a program week: app / offline / missed / upcoming. */
function sessionStatus(st, weekAbs, sid, today) {
  const start = addDays(parseKey(st.startDate), weekAbs * 7);
  for (let i = 0; i < 7; i++) {
    const k = dateKey(addDays(start, i));
    const l = st.logs[k];
    if (l && l.done && l.session === sid) return { status: l.offline ? 'offline' : 'app', date: addDays(start, i) };
  }
  const idx = orderFor((weekAbs % 12) + 1).indexOf(sid);
  const date = addDays(start, st.schedule[idx] ?? idx);
  const weekEnd = addDays(start, 6);
  return { status: dayDiff(weekEnd, today) > 0 ? 'missed' : 'upcoming', date };
}

/**
 * Mark a session as completed outside the app. Uses its scheduled day if free,
 * otherwise another free day of that week, never a future day.
 */
function markOffline(st, weekAbs, sid, today) {
  const start = addDays(parseKey(st.startDate), weekAbs * 7);
  const idx = orderFor((weekAbs % 12) + 1).indexOf(sid);
  const pref = addDays(start, st.schedule[idx] ?? idx);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
    .filter((d) => dayDiff(d, today) >= 0)
    .sort((a, b) => Math.abs(dayDiff(pref, a)) - Math.abs(dayDiff(pref, b)));
  const free = days.find((d) => { const l = st.logs[dateKey(d)]; return !l || !l.done; });
  if (!free) return false;
  const k = dateKey(free);
  st.logs[k] = { ...(st.logs[k] || {}), session: sid, done: true, offline: true };
  return true;
}
function unmarkOffline(st, weekAbs, sid) {
  const start = addDays(parseKey(st.startDate), weekAbs * 7);
  for (let i = 0; i < 7; i++) {
    const k = dateKey(addDays(start, i));
    const l = st.logs[k];
    if (l && l.offline && l.session === sid) { l.done = false; l.offline = false; l.session = undefined; }
  }
}

/** Per-week summary from week 0 up to the week containing `today`. */
function weekly(st, today, hist = history(st)) {
  const cur = position(st, today);
  if (!cur) return [];
  const weeks = [];
  for (let w = 0; w <= cur.weekAbs; w++) {
    const week = (w % 12) + 1;
    const start = addDays(parseKey(st.startDate), w * 7);
    const hs = hist.filter((h) => h.pos.weekAbs === w);
    weeks.push({
      weekAbs: w, week, cycle: Math.floor(w / 12), start,
      required: requiredFor(week),
      app: hs.filter((h) => !h.offline).length,
      offline: hs.filter((h) => h.offline).length,
      appVolume: hs.filter((h) => !h.offline).reduce((a, h) => a + h.volume, 0),
      offlineVolume: hs.filter((h) => h.offline).reduce((a, h) => a + h.volume, 0),
      current: w === cur.weekAbs,
    });
  }
  return weeks;
}

/** Consecutive fully-completed weeks, counting back from the latest one (current week counts once complete). */
function streak(weeks) {
  let n = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i];
    const complete = w.app + w.offline >= w.required;
    if (complete) n++;
    else if (!w.current) break;
  }
  return n;
}

/** TM for each week up to the end of the current cycle (step series). */
function tmSeries(st, lift, today) {
  const cur = position(st, today);
  const last = cur ? (cur.cycle + 1) * 12 - 1 : 11;
  return Array.from({ length: last + 1 }, (_, w) => ({
    weekAbs: w, date: addDays(parseKey(st.startDate), w * 7),
    tm: roundTo(tmFor(st, Math.floor(w / 12), (w % 12) + 1, lift), 0.5),
  }));
}

function e1rmSeries(hist, lift) {
  return hist.filter((h) => h.lift === lift && h.e1rm).map((h) => ({ date: h.date, ...h.e1rm }));
}

/** How many completed sessions included each exercise id. */
function exerciseCounts(hist) {
  const c = {};
  hist.forEach((h) => (h.exIds || []).forEach((id) => (c[id] = (c[id] || 0) + 1)));
  return c;
}

function personalRecords(st, hist) {
  const out = {};
  LIFTS.forEach((l) => {
    const pts = e1rmSeries(hist, l);
    const best = pts.reduce((a, p) => (!a || p.value > a.value ? p : a), null);
    const heaviest = hist.filter((h) => h.lift === l && h.top && !h.offline).reduce((a, h) => (!a || h.top.w > a.w ? { ...h.top, date: h.date } : a), null);
    out[l] = { best, heaviest, start: st.lifts[l].oneRM };
  });
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { summarizeSession, history, sessionStatus, markOffline, unmarkOffline, weekly, streak, tmSeries, e1rmSeries, personalRecords, exerciseCounts };
}
