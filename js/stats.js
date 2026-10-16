'use strict';
/* Training history & analytics: completion status, offline (outside-the-app) sessions, volume, e1RM, streaks. */

if (typeof module !== 'undefined') Object.assign(globalThis, require('./engine.js'), require('./data.js'));

const firstInt = (s) => parseInt(String(s), 10) || 0;

/* ---------- Editable sets ----------
 * The plan gives default weight / reps per set. In the workout the user can change weight, reps
 * and set type, add or remove sets, and add extra exercises. Overrides live in the day's log:
 *   log.sx['<sid>:<blockKey>'] = [{ w, r, t }, ...]   (one entry per set; missing fields = plan)
 *   log.extra[sid] = [{ k, id, name, img, cue }]       (exercises added by the user)
 */
const SET_TYPES = { work: '正式组', warm: '热身组', drop: '递减组', fail: '力竭组' };
const SET_TYPE_ORDER = ['work', 'warm', 'drop', 'fail'];

/** buildSession + the exercises the user added to this day. sid 'free' = a free workout with only added exercises. */
function sessionWithExtras(st, date, sid, log) {
  let s;
  if (sid === 'free') s = { pos: null, blocks: [], notes: [], sessionId: 'free' };
  else if (isCustomDay(sid)) {
    const d = customDay(st, sid);
    s = d && { pos: position(st, date), blocks: [], notes: [], sessionId: sid, custom: d };
  } else s = buildSession(st, date, sid, { readiness: log.readiness, swaps: (log.swaps || {})[sid] || {} });
  if (!s) return s;
  if (sid !== 'free') templateBlocks(st, date, sid, log, s);
  ((log.extra || {})[sid] || []).forEach((e) => s.blocks.push({
    key: `x${e.k}`, type: 'sets', ex: e, title: `自选 · ${e.name}`, sets: 3, reps: e.reps || '10', extra: true,
  }));
  return s;
}

/* Training days the user added to a plan (e.g. 第三推): state.customDays[program] = [{ id: 'cd_…', name, ref }].
 * Their exercises live in state.tplEx[id]; 'ref' is the plan session whose main lift 'follow' exercises copy. */
const isCustomDay = (sid) => String(sid).startsWith('cd_');
const customDay = (st, sid) => Object.values(st.customDays || {}).flat().find((d) => d.id === sid);

/** Current 1RM-equivalent of a session's main lift; custom template exercises are scaled from it. */
function sessionRef(st, date, sid) {
  if (isCustomDay(sid)) { const d = customDay(st, sid); return d ? sessionRef(st, date, d.ref) : 0; }
  const pos = position(st, date);
  if (!pos || !SESSIONS[sid]) return 0;
  if (programOfSession(sid) === 'mike') return mikeMax(st, pos.cycle, sid === 'mike2' ? 'cg' : 'bench');
  return tmFor(st, pos.cycle, pos.week, SESSIONS[sid].main) / 0.9;
}

/**
 * Exercises the user saved into a plan template (state.tplEx[sid]). They are optional per day
 * (log.tplPick[sid] = chosen keys; missing = all). 'follow' exercises copy the main lift's sets,
 * reps and percentages, scaled by ratio = own 1RM / main-lift 1RM, so they progress, wave and
 * deload exactly like the main lift.
 */
function templateBlocks(st, date, sid, log, s) {
  const list = (st.tplEx || {})[sid] || [];
  const pick = (log.tplPick || {})[sid];
  const refSess = s.custom ? buildSession(st, date, s.custom.ref, {}) : s;
  const main = refSess && refSess.blocks.find((b) => b.type === 'main');
  const ref = list.some((e) => e.follow) ? sessionRef(st, date, sid) : 0;
  list.filter((e) => !pick || pick.includes(e.k)).forEach((e) => {
    const b = { key: `t${e.k}`, type: 'sets', ex: e, tpl: true, title: `模板 · ${e.name}`, sets: e.sets || 3, reps: String(e.reps || 10) };
    if (e.follow && e.ratio && main && !main.test) {
      const inc = e.inc || 2.5;
      b.rows = main.rows.filter((r) => !r.extra).map((r) => ({ w: Math.max(0, Math.round((r.w * e.ratio) / inc) * inc), reps: r.reps, pct: r.pct, label: r.label }));
      b.oneRM = Math.round(ref * e.ratio * 2) / 2;
    }
    s.blocks.push(b);
  });
}

function plannedRows(st, b) {
  if (b.rows) {
    return b.rows.map((r) => ({ w: r.w, r: r.reps, t: r.label === '热身' ? 'warm' : 'work', plus: !!r.plus, pct: r.pct, label: r.label, single: !!r.extra }));
  }
  const last = b.ex && st.lastW && st.lastW[b.ex.id];
  const w = b.w != null ? b.w : last ? last.w : null;
  const r = firstInt(b.reps) || (last ? last.r : 10);
  return Array.from({ length: b.sets }, () => ({ w, r, t: 'work' }));
}

/** The sets of one block as they will be done: plan merged with the user's edits. */
function blockRows(st, log, sid, b) {
  const plan = plannedRows(st, b);
  const ov = log.sx && log.sx[`${sid}:${b.key}`];
  const rows = !ov ? plan.map((r) => ({ ...r })) : ov.map((o, i) => {
    const base = plan[i] ? { ...plan[i] } : { w: plan.length ? plan[plan.length - 1].w : null, r: plan.length ? plan[plan.length - 1].r : 10, t: 'work' };
    if (o.w !== undefined) base.w = o.w;
    if (o.r !== undefined) base.r = o.r;
    if (o.t) base.t = o.t;
    return base;
  });
  rows.forEach((r, i) => {
    r.planR = r.r;
    const a = (log.amrap || {})[`${sid}:${b.key}:${i}`];
    if (r.plus && a) r.r = a;
  });
  return rows;
}

/** Muscle group of an exercise (library category keys: chest, back, leg, shoulder…). */
function exCat(ex, lift) {
  const l = lift || ex.lift;
  if (l && LIFT_CAT[l]) return LIFT_CAT[l];
  if (ex.cats && ex.cats.length) return ex.cats.find((c) => c !== 'main') || ex.cats[0];
  return MUSCLE_CAT[ex.m] || '';
}
/** Sets / volume of a free workout or custom day (only ticked sets count; warm-ups excluded). */
function freeSummary(st, date, log, sid = 'free') {
  const s = sessionWithExtras(st, date, sid, log);
  let sets = 0, done = 0, volume = 0;
  if (!s) return { exercises: 0, sets, done, volume, names: [], cats: [], doneCats: [] };
  const doneCats = [];
  s.blocks.forEach((b) => {
    const ticks = (log.sets || {})[`${sid}:${b.key}`] || [];
    if (ticks.some(Boolean)) doneCats.push(b.cat || exCat(b.ex || {}, b.lift));
    blockRows(st, log, sid, b).forEach((r, i) => {
      sets++;
      if (!ticks[i]) return;
      done++;
      if (r.t !== 'warm') volume += (Number(r.w) || 0) * (Number(r.r) || 0);
    });
  });
  return { exercises: s.blocks.length, sets, done, volume: Math.round(volume), names: s.blocks.map((b) => (b.ex ? b.ex.name : b.title.split(' · ').slice(1).join(' · ') || b.title)), cats: s.blocks.map((b) => b.cat || exCat(b.ex || {}, b.lift)), doneCats };
}

/**
 * What was actually done in a session. In-app sessions count ticked sets (all sets if none
 * were ticked), skip warm-up sets, and use the weight / reps the user entered; offline sessions
 * assume the plan was completed.
 */
function summarizeSession(st, date, sid, log) {
  const s = sessionWithExtras(st, date, sid, log);
  if (!s) return null;
  const pos = s.pos;
  const main = s.blocks.find((b) => b.type === 'main') || s.blocks[0];
  const mike = programOfSession(sid) === 'mike';
  const secondary = SESSIONS[sid].secondary;
  const out = { lift: main.lift, variant: mike ? main.title.replace(/^.*· /, '') : variantOf(st, main.lift).name, volume: 0, sets: 0, e1rm: null, top: null, test: null,
    exIds: (mike ? ['bb_bench'] : [variantOf(st, main.lift).id]).concat(s.test || !secondary ? [] : [variantOf(st, secondary).id], s.blocks.filter((b) => b.ex).map((b) => b.ex.id)) };
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
    blockRows(st, log, sid, b).forEach((r, i) => {
      if (any && !ticks[i]) return;
      if (r.t === 'warm') return;
      const w = Number(r.w) || 0;
      const reps = Number(r.r) || 0;
      out.sets++;
      out.volume += w * reps;
      if (b.type !== 'main') return;
      if (!out.top || w > out.top.w) out.top = { w, reps };
      const a = amrap[`${sid}:${b.key}:${i}`];
      if (r.plus && a) {
        const v = Math.round(epley(w, a) * 2) / 2;
        if (!out.e1rm || v > out.e1rm.value) out.e1rm = { value: v, w, reps: a, src: 'amrap' };
      }
    });
  });
  out.volume = Math.round(out.volume);
  return out;
}

/** Every completed session, oldest first. */
function trainingHistory(st) {
  return Object.keys(st.logs).sort().map((k) => {
    const log = st.logs[k];
    if (!log.done || !SESSIONS[log.session]) return null;
    const date = parseKey(k);
    const program = programOfSession(log.session);
    const sv = asProgram(st, program); // each workout is read against the program it belongs to
    const pos = position(sv, date);
    if (!pos) return null;
    const res = (!log.offline && log.result) || summarizeSession(sv, date, log.session, log);
    return res && { key: k, date, pos, program, session: log.session, offline: !!log.offline, ...res };
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
  const idx = orderFor((weekAbs % progOf(st).weeks) + 1, st).indexOf(sid);
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
  const idx = orderFor((weekAbs % progOf(st).weeks) + 1, st).indexOf(sid);
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
function weekly(st, today, hist = trainingHistory(st)) {
  const cur = position(st, today);
  if (!cur) return [];
  const weeks = [];
  const n = progOf(st).weeks;
  const prog = progOf(st).id;
  for (let w = 0; w <= cur.weekAbs; w++) {
    const week = (w % n) + 1;
    const start = addDays(parseKey(st.startDate), w * 7);
    const hs = hist.filter((h) => h.program === prog && h.pos.weekAbs === w);
    weeks.push({
      weekAbs: w, week, cycle: Math.floor(w / n), start,
      required: requiredFor(week, st),
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
  const n = progOf(st).weeks;
  const last = cur ? (cur.cycle + 1) * n - 1 : n - 1;
  return Array.from({ length: last + 1 }, (_, w) => ({
    weekAbs: w, date: addDays(parseKey(st.startDate), w * 7),
    // 5/3/1 plots its training max; the Mike plan works straight off the bench 1RM
    tm: isMike(st) ? (lift === 'bench' ? roundTo(mikeMax(st, Math.floor(w / n), 'bench'), 0.5) : null)
      : roundTo(tmFor(st, Math.floor(w / n), (w % n) + 1, lift), 0.5),
  })).filter((p) => p.tm !== null);
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
  module.exports = { summarizeSession, sessionWithExtras, sessionRef, isCustomDay, customDay, freeSummary, blockRows, SET_TYPES, SET_TYPE_ORDER, trainingHistory, sessionStatus, markOffline, unmarkOffline, weekly, streak, tmSeries, e1rmSeries, personalRecords, exerciseCounts };
}
