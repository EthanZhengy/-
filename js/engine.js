'use strict';
/* Program engine: dates, training maxes, daily session building, accessory selection, nutrition. */

if (typeof module !== 'undefined') Object.assign(globalThis, require('./data.js'));

/* ---------- dates ---------- */
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dayDiff(a, b) {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}
const weekdayIdx = (d) => (d.getDay() + 6) % 7; // Monday = 0
const mondayOf = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -weekdayIdx(d));
const fmtDate = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

/* ---------- weights ---------- */
const fmtW = (w) => String(Math.round(w * 100) / 100);
function roundTo(w, inc) { return Math.max(0, Math.round(w / inc) * inc); }
const epley = (w, reps) => (reps <= 1 ? w : w * (1 + reps / 30));

function variantOf(st, lift) {
  const list = VARIANTS[lift];
  return list.find((v) => v.id === st.lifts[lift].variant) || list[0];
}
function incOf(st, v) { return v.inc === 'bar' ? st.plateInc : v.inc; }

/** Cycle starting TM. Cycle 0 = 90% of the entered 1RM; later cycles use the week-12 test, else keep progressing. */
function baseTM(st, cycle, lift) {
  if (cycle <= 0) return 0.9 * st.lifts[lift].oneRM;
  const tested = st.tests[cycle - 1] && st.tests[cycle - 1][lift];
  if (tested) return 0.9 * tested;
  return baseTM(st, cycle - 1, lift) + 3 * TM_INC[lift];
}
function tmFor(st, cycle, week, lift) {
  return baseTM(st, cycle, lift) + TM_INC[lift] * (week >= 9 ? 2 : week >= 5 ? 1 : 0);
}

/* ---------- programs ---------- */
// UI code may omit `st`: it then means the app's current state (the active program).
const cur = (st) => st || (typeof state !== 'undefined' ? state : null);
const progOf = (st) => PROGRAMS[(cur(st) && cur(st).program) || '531'] || PROGRAMS['531'];
const isMike = (st) => progOf(st).id === 'mike';
const programOfSession = (sid) => (String(sid).startsWith('mike') ? 'mike' : '531');
const isTestWeek = (week, st) => week === progOf(st).weeks;
function orderFor(week, st) {
  if (isMike(st)) return isTestWeek(week, st) ? ['mikeTest'] : ['mike1', 'mike2'];
  return week === 12 ? TEST_ORDER : SESSION_ORDER;
}
function requiredFor(week, st) {
  if (isMike(st)) return isTestWeek(week, st) ? 1 : 2;
  return week === 12 ? 3 : 4; // press test in week 12 is optional
}
const weekName = (week, st) => (isMike(st) ? MIKE_WEEKS : WEEKS)[week - 1].name;
/** The state as seen by another program (its own start date, schedule and tests), for history across programs. */
function asProgram(st, prog) {
  if ((st.program || '531') === prog) return st;
  return { ...st, ...((st.programs || {})[prog] || {}), program: prog };
}

/* ---------- program position ---------- */
function position(st, date) {
  const start = parseKey(st.startDate);
  const diff = dayDiff(start, date);
  if (diff < 0) return null;
  const weekAbs = Math.floor(diff / 7);
  const n = progOf(st).weeks;
  return {
    weekAbs, cycle: Math.floor(weekAbs / n), week: (weekAbs % n) + 1,
    weekStart: addDays(start, weekAbs * 7), weekEnd: addDays(start, weekAbs * 7 + 6),
  };
}

function scheduledFor(st, date, week) {
  const i = st.schedule.indexOf(weekdayIdx(date));
  return i < 0 ? null : orderFor(week, st)[i] || null;
}

/** Sessions marked done in the program week containing `date` (optionally excluding one day). */
function doneSessions(st, pos, excludeKey) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const k = dateKey(addDays(pos.weekStart, i));
    const l = st.logs[k];
    if (k !== excludeKey && l && l.done && l.session && l.session !== 'rest') out.push(l.session);
  }
  return out;
}
function doneOn(st, date) {
  const l = st.logs[dateKey(date)];
  return l && l.done && l.session !== 'rest' ? l.session : null;
}
const isLower = (s) => !!LOWER[s];

/**
 * What to train today. Follows the fixed weekly schedule, but adapts when sessions were
 * moved: never stacks two lower-body days back to back if an upper day is available,
 * and adds catch-up days when the week is running out of scheduled slots.
 */
function recommend(st, date) {
  const pos = position(st, date);
  if (!pos) return { session: 'rest', reason: `计划将于 ${fmtDate(parseKey(st.startDate))} 开始` };
  const key = dateKey(date);
  const order = orderFor(pos.week, st);
  const done = doneSessions(st, pos, key);
  const required = order.slice(0, requiredFor(pos.week, st)).filter((s) => !done.includes(s));
  if (!required.length) {
    if (!isMike(st) && pos.week === 12 && !done.includes('press')) return { session: 'rest', reason: '三项测试已完成，推举测试可选' };
    return { session: 'rest', reason: '本周训练已全部完成 🎉 好好恢复' };
  }
  const yesterday = doneOn(st, addDays(date, -1));
  const clash = (s) => yesterday && isLower(yesterday) && isLower(s);
  const sched = scheduledFor(st, date, pos.week);
  const label = (s) => (!isMike(st) && pos.week === 12 ? `${LIFT_NAMES[s]}测试` : SESSION_LABEL[s]);

  // Scheduled slots left after today (excluding today)
  let slotsAfter = 0;
  for (let d = addDays(date, 1); d <= pos.weekEnd; d = addDays(d, 1)) if (st.schedule.includes(weekdayIdx(d))) slotsAfter++;
  const isTrainingDay = st.schedule.includes(weekdayIdx(date));
  if (!isTrainingDay && required.length <= slotsAfter) return { session: 'rest', reason: `今天${WEEKDAYS[weekdayIdx(date)]}，计划休息` };

  if (sched && required.includes(sched) && !clash(sched)) {
    return { session: sched, reason: `今天${WEEKDAYS[weekdayIdx(date)]}，按计划练${label(sched)}` };
  }
  const ok = required.filter((s) => !clash(s));
  const pick = ok[0] || required[0];
  let reason;
  if (sched && clash(sched)) reason = `昨天练了${LIFT_NAMES[yesterday]}，下肢需要恢复，今天先练${label(pick)}，${label(sched)}往后挪`;
  else if (sched && !required.includes(sched)) reason = `${label(sched)}本周已经练过了，今天练${label(pick)}`;
  else if (!isTrainingDay) reason = `本周还剩 ${required.length} 次训练、只剩 ${slotsAfter} 个训练日，建议今天补练${label(pick)}`;
  else reason = `今天练${label(pick)}`;
  if (!ok.length) reason += '（昨天刚练下肢，注意充分热身，必要时选「疲劳」模式）';
  return { session: pick, reason };
}

/** Suggested arrangement for the rest of the week, given what is done and what is chosen today. */
function remainingPlan(st, date, todaySession) {
  const pos = position(st, date);
  if (!pos) return { plan: [], unplaced: [] };
  const key = dateKey(date);
  const order = orderFor(pos.week, st);
  const done = doneSessions(st, pos, key);
  if (todaySession && todaySession !== 'rest') done.push(todaySession);
  const left = order.slice(0, requiredFor(pos.week, st)).filter((s) => !done.includes(s));
  if (!left.length) return { plan: [], unplaced: [] };

  const after = [];
  for (let d = addDays(date, 1); d <= pos.weekEnd; d = addDays(d, 1)) after.push(d);
  const sched = after.filter((d) => st.schedule.includes(weekdayIdx(d)));
  const extra = after.filter((d) => !st.schedule.includes(weekdayIdx(d))).reverse(); // weekend first for catch-up
  const days = sched.concat(extra).slice(0, left.length).sort((a, b) => a - b);
  const n = days.length;

  let best = null;
  const prevSession = todaySession && todaySession !== 'rest' ? todaySession : doneOn(st, addDays(date, -1));
  const prevDate = todaySession && todaySession !== 'rest' ? date : addDays(date, -1);
  permutations(left, n).forEach((perm) => {
    let cost = 0, ps = prevSession, pd = prevDate;
    perm.forEach((s, i) => {
      if (ps && dayDiff(pd, days[i]) === 1) cost += isLower(ps) && isLower(s) ? 3 : isLower(ps) === isLower(s) ? 1 : 0;
      if (scheduledFor(st, days[i], pos.week) !== s) cost += 0.5;
      ps = s; pd = days[i];
    });
    if (!best || cost < best.cost) best = { cost, perm };
  });
  const plan = best ? best.perm.map((s, i) => ({ date: days[i], session: s })) : [];
  return { plan, unplaced: left.filter((s) => !plan.some((p) => p.session === s)) };
}
function permutations(arr, k) {
  if (k === 0) return [[]];
  const out = [];
  arr.forEach((x, i) => permutations(arr.filter((_, j) => j !== i), k - 1).forEach((p) => out.push([x, ...p])));
  return out;
}

/* ---------- accessory selection ---------- */
function hasEquip(st, e) {
  return (e.eq || []).every((tok) => tok.split('|').some((t) => st.equipment.includes(t)));
}
function allExercises(st) { return EXERCISES.concat(st.customEx || []); }
function exById(st, id) { return allExercises(st).find((e) => e.id === id); }

/** pickOnly = added by hand when swapping; used where chosen, never auto-scheduled (unless liked). */
function candidates(st, slot, withPicked = false) {
  return allExercises(st).filter((e) => e.slot === slot && hasEquip(st, e) && (withPicked || !e.pickOnly || st.favorites.includes(e.id)) &&
    !(e.avoid || []).some((i) => st.injuries.includes(i)) && !st.excluded.includes(e.id));
}
function nextDayLower(st, date) {
  const pos = position(st, addDays(date, 1));
  if (!pos || isTestWeek(pos.week, st)) return false;
  const s = scheduledFor(st, addDays(date, 1), pos.week);
  return !!s && isLower(s);
}
function scoreEx(st, e, sessionId, date) {
  const fit = DAY_FIT[sessionId] || {};
  let s = fit[e.m] || 0;
  if (e.back) s += (fit.back || 0) + (nextDayLower(st, date) ? -2 : 0) + (st.injuries.includes('lowerBack') ? -4 : 0);
  if (st.favorites.includes(e.id)) s += 3;
  return s;
}
function hash(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

/** Exercises for a slot, best first. */
function ranked(st, slot, sessionId, date, withPicked = false) {
  return candidates(st, slot, withPicked)
    .map((e) => ({ e, s: scoreEx(st, e, sessionId, date) }))
    .sort((a, b) => b.s - a.s || hash(a.e.id) - hash(b.e.id));
}
/**
 * Pick `count` exercises: favourites and best-fitting first, rotating week to week among
 * the near-best options for variety, and never two from the same muscle group.
 */
function pickExercises(st, slot, sessionId, date, count, weekAbs, taken = []) {
  const picks = [];
  let pool = ranked(st, slot, sessionId, date).filter((x) => !taken.includes(x.e.id));
  for (let i = 0; i < count && pool.length; i++) {
    const top = pool.filter((x) => x.s >= pool[0].s - 1);
    const p = top[(weekAbs + i * 3 + hash(sessionId)) % top.length].e;
    picks.push(p);
    pool = pool.filter((x) => x.e.m !== p.m || p.m === 'custom').filter((x) => x.e.id !== p.id);
  }
  return picks;
}

/* ---------- daily session ---------- */
const READINESS = {
  great: { label: '💪 状态很好' },
  normal: { label: '🙂 正常' },
  tired: { label: '😮‍💨 疲劳 / 没睡好' },
  short: { label: '⏱ 时间紧' },
};

/**
 * Build a concrete workout for `sessionId` on `date`.
 * opts.readiness adjusts volume; opts.swaps overrides chosen accessories by block key.
 */
function buildSession(st, date, sessionId, opts = {}) {
  const pos = position(st, date);
  if (!pos || !SESSIONS[sessionId]) return null;
  if (isMike(st)) return programOfSession(sessionId) === 'mike' ? buildMike(st, date, pos, sessionId, opts) : null;
  if (programOfSession(sessionId) !== '531') return null;
  const W = WEEKS[pos.week - 1];
  const r = opts.readiness || 'normal';
  const swaps = opts.swaps || {};
  const cfg = SESSIONS[sessionId];
  const notes = [];
  const blocks = [];

  if (W.test) return buildTest(st, pos, sessionId, r);

  // Main lift
  const lift = cfg.main;
  const v = variantOf(st, lift);
  const tm = tmFor(st, pos.cycle, pos.week, lift);
  const inc = incOf(st, v);
  const rows = W.main.map(([pct, reps], i) => ({
    pct, reps, w: roundTo(tm * pct / 100, inc),
    plus: i === W.main.length - 1 && (W.lastPlus === 'all' || (W.lastPlus === 'press' && lift === 'press')),
  }));
  if (lift !== 'press') W.extra.forEach(([pct, reps, plus]) => rows.push({ pct, reps, w: roundTo(tm * pct / 100, inc), plus, extra: true }));
  let mainRows = rows;
  if (r === 'tired') {
    if (rows.some((x) => x.extra)) notes.push('疲劳模式：跳过 100% 以上的单次组');
    if (rows.some((x) => x.plus)) notes.push('疲劳模式：最后一组只完成规定次数，不做 "+"');
    mainRows = rows.filter((x) => !x.extra).map((x) => ({ ...x, plus: false }));
  }
  if (r === 'great' && rows.some((x) => x.plus)) notes.push('状态好：带 "+" 的组可以多做几次，保留 1–2 次余力，不要力竭');
  blocks.push({ key: 'main', type: 'main', title: `主项 · ${v.name}`, sub: `TM ${fmtW(roundTo(tm, 0.5))}kg`, rows: mainRows, lift, img: EX_IMG[v.id] });

  // Secondary lift
  if (W.sec) {
    const lift2 = cfg.secondary;
    const v2 = variantOf(st, lift2);
    let pct = W.sec.pct, sets = W.sec.sets;
    const reps = lift2 === 'deadlift' ? W.sec.dlReps : W.sec.reps;
    if (r === 'tired') { sets = Math.min(sets, 3); pct = Math.max(40, pct - 10); notes.push('疲劳模式：第二主项减到 3 组、重量降 10%'); }
    if (r === 'short') sets = Math.min(sets, 3);
    const w = roundTo(tmFor(st, pos.cycle, pos.week, lift2) * pct / 100, incOf(st, v2));
    blocks.push({ key: 'sec', type: 'sets', title: `第二主项 · ${v2.name}`, sub: `${pct}% TM`, w, sets, reps, lift: lift2, img: EX_IMG[v2.id] });
  }

  // Pull / core slot
  if (W.pc && r !== 'short') {
    const sets = r === 'tired' ? Math.max(2, W.pc - 2) : W.pc;
    const [auto] = pickExercises(st, cfg.slot, sessionId, date, 1, pos.weekAbs);
    const e = (swaps.slot && exById(st, swaps.slot)) || auto;
    if (e) blocks.push({ key: 'slot', type: 'sets', slot: cfg.slot, ex: e, title: `${SLOT_NAMES[cfg.slot]} · ${e.name}`, sets, reps: e.reps });
  }
  if (r === 'short') notes.push('时间紧：只做主项和第二主项，辅助动作今天跳过');

  // Accessories
  let accN = W.acc;
  if (r === 'tired') accN = Math.min(accN, 1);
  if (r === 'short') accN = 0;
  if (accN) {
    const auto = pickExercises(st, cfg.acc, sessionId, date, accN, pos.weekAbs);
    const used = [];
    auto.forEach((a, i) => {
      const k = `acc${i}`;
      const e = (swaps[k] && exById(st, swaps[k])) || a;
      if (used.includes(e.id)) return;
      used.push(e.id);
      blocks.push({ key: k, type: 'sets', slot: cfg.acc, ex: e, title: `辅助 · ${e.name}`, sets: W.deload ? 2 : 3, reps: e.reps });
    });
  }
  if (W.note) notes.push(W.note);
  if (W.deload) notes.push('减载周：重量轻是故意的，专注动作质量，让身体恢复');
  return { pos, week: W, sessionId, blocks, notes, kind: isLower(sessionId) ? 'lower' : 'upper' };
}

/** Week 12: work up to a new 1RM. Estimated current max = TM / 0.9. */
function buildTest(st, pos, lift, r) {
  const v = variantOf(st, lift);
  const est = tmFor(st, pos.cycle, 12, lift) / 0.9;
  const inc = incOf(st, v);
  const ladder = [[40, 5, '热身'], [55, 3, '热身'], [70, 2, '热身'], [80, 1, '热身'], [88, 1, '热身'],
    [93, 1, '第一次试举'], [100, 1, '第二次试举'], [103, 1, '第三次试举（状态好再上）']];
  const rows = ladder.map(([pct, reps, label]) => ({ pct, reps, label, w: roundTo(est * pct / 100, inc) }));
  const notes = ['试举之间休息 3–5 分钟，必须有保护或安全杠', '动作变形就停，以最后一次标准完成的重量为准'];
  if (lift === 'press') notes.unshift('推举测试是可选的');
  if (r === 'tired') notes.unshift('⚠️ 状态不好不建议测极限，可以改天再测');
  return {
    pos, week: WEEKS[11], sessionId: lift, test: true, kind: isLower(lift) ? 'lower' : 'upper', notes,
    blocks: [{ key: 'main', type: 'main', title: `${LIFT_NAMES[lift]}极限测试 · ${v.name}`, img: EX_IMG[v.id], sub: `预估 1RM ≈ ${fmtW(roundTo(est, inc))}kg`, rows, lift, test: true }],
  };
}

/* ---------- Mike 卧推增力计划 ---------- */
/** Bench / close-grip 1RM for a cycle: the entered values, then each week-16 test result (close-grip scales with bench). */
function mikeMax(st, cycle, which) {
  const m = st.mike || {};
  const bench0 = m.bench1RM || 0;
  const cg0 = m.cg1RM || Math.round(bench0 * 0.9 * 2) / 2;
  if (cycle <= 0) return which === 'cg' ? cg0 : bench0;
  const prevBench = mikeMax(st, cycle - 1, 'bench');
  const tested = st.tests[cycle - 1] && st.tests[cycle - 1].bench;
  const bench = tested || prevBench;
  if (which === 'bench') return bench;
  return Math.round(mikeMax(st, cycle - 1, 'cg') * (prevBench ? bench / prevBench : 1) * 100) / 100;
}

function buildMike(st, date, pos, sid, opts = {}) {
  const W = MIKE_WEEKS[pos.week - 1];
  const r = opts.readiness || 'normal';
  const inc = st.plateInc || 2.5;
  const bench = mikeMax(st, pos.cycle, 'bench');
  const cg = mikeMax(st, pos.cycle, 'cg');
  const notes = [MIKE_WARMUP];
  const blocks = [];
  const ACC_CAT = { fly: 'chest', db: 'chest', machine: 'chest', dips: 'chest', pushdown: 'tri', ohext: 'tri', hammer: 'bi', curl: 'bi' };
  const acc = (key, title, sets, reps, note, optional) => ({ key, type: 'sets', title, sets, reps, note, optional, cat: ACC_CAT[key] });

  if (W.test || sid === 'mikeTest') {
    const ladder = [[0, '8-10', '空杠热身'], [40, '5-8', '热身'], [60, '3-6', '热身'], [80, '1-2', '热身'], [92.5, 1, '90–95%'], [102.5, 1, '冲新极限']];
    const rows = ladder.map(([pct, reps, label]) => ({ pct, reps, label, w: pct ? roundTo(bench * pct / 100, inc) : 20 }));
    notes.push('试举之间休息 3–5 分钟，必须有保护', '最后一组按状态加重，以标准完成的最大重量为新极限 🎉');
    if (r === 'tired') notes.unshift('⚠️ 状态不好不建议测极限，可以改天再测');
    return { pos, week: W, sessionId: sid, test: true, kind: 'upper', notes,
      blocks: [{ key: 'main', type: 'main', title: '卧推极限测试 · 杠铃卧推', sub: `当前 1RM ${fmtW(roundTo(bench, inc))}kg`, rows, lift: 'bench', test: true }] };
  }

  if (sid === 'mike1') {
    const [sets, reps, pct, rpe] = W.b;
    const w = roundTo(bench * pct / 100, inc);
    const main = { key: 'main', type: 'main', title: '主项 · 杠铃卧推', sub: `${pct}% 1RM · RPE ${rpe}`, lift: 'bench',
      rows: Array.from({ length: sets }, () => ({ pct, reps, w })) };
    if (W.phase === 1) {
      blocks.push(acc('fly', '激活 · 蝴蝶机夹胸', 2, '20', '先做两组激活胸肌，轻重量'));
      blocks.push(main);
      blocks.push(acc('db', '辅助 · 哑铃上斜 / 平板卧推', 4, '8-10', '哪个弱练哪个，二选一 · RPE 8 · 组间 3 分钟'));
      blocks.push(acc('machine', '辅助 · 固定器械推胸', 4, '8-10', '根据弱项在上 / 中 / 下胸三选二 · RPE 8'));
      blocks.push(acc('dips', '辅助 · 双杠 / 俯卧撑', 3, '力竭', '看体能选做，累了可以不做', true));
    } else {
      blocks.push(main);
      const v = MIKE_VARIANTS[(st.mike && st.mike.variant) || 'pause'] || MIKE_VARIANTS.pause;
      const isPause = (st.mike && st.mike.variant || 'pause') === 'pause';
      blocks.push({ key: 'var', type: 'sets', cat: 'chest', title: `五选一 · ${v.name}`, sub: '当天卧推重量的 80%', w: roundTo(w * 0.8, inc), sets: 3,
        reps: isPause ? String({ 1: 6, 2: 4, 3: 2 }[W.pause]) : '6', note: `${v.cue}${isPause ? ` 本周暂停 ${W.pause} 秒。` : ''}` });
      blocks.push(acc('db', '辅助 · 哑铃上斜 / 平板卧推', 4, '8-10', '哪个弱练哪个，二选一 · RPE 8'));
      blocks.push(acc('dips', '辅助 · 双杠', 4, '12', '有条件可以负重'));
      blocks.push(acc('machine', '辅助 · 固定器械推胸', 4, '8-12', '哪里弱练哪里，选 1–2 个；体能不足只做一个 · RPE 8'));
    }
  } else {
    const [pct, rpe] = W.cg;
    const w = roundTo(cg * pct / 100, inc);
    if (W.phase === 1) {
      const w2 = roundTo(w * 0.9, inc);
      blocks.push({ key: 'main', type: 'main', title: '主项 · 窄推 / 弹力带卧推', sub: `窄推 1RM 的 ${pct}% · RPE ${rpe}`, lift: 'bench',
        rows: [{ pct, reps: 8, w }, { pct, reps: 8, w }, { pct: Math.round(pct * 0.9), reps: 8, w: w2, label: '减重 10%' }, { pct: Math.round(pct * 0.9), reps: 8, w: w2, label: '减重 10%' }] });
      notes.push('三头弱、锁定不足练窄推；胸比三头弱但锁定不足练弹力带卧推');
      blocks.push(acc('dips', '辅助 · 双杠（不负重）', 4, '做到最多', '高次数，能做多少做多少'));
      blocks.push(acc('pushdown', '辅助 · 三头直杆下压', 4, '8-12', 'RPE 8 · 组间 3 分钟'));
      blocks.push(acc('ohext', '辅助 · 哑铃颈后臂屈伸', 4, '8-12', 'RPE 8'));
      blocks.push(acc('hammer', '辅助 · 锤式弯举', 4, '12', 'RPE 8'));
      blocks.push(acc('curl', '辅助 · 哑铃 / 杠铃弯举', 4, '12', 'RPE 8'));
    } else {
      const [sets, reps] = W.b;
      blocks.push({ key: 'main', type: 'main', title: '主项 · 窄推', sub: `窄推 1RM 的 ${pct}% · RPE ${rpe}`, lift: 'bench',
        rows: Array.from({ length: sets }, () => ({ pct, reps, w })) });
      blocks.push(acc('dips', '辅助 · 双杠', 4, '12', '有条件可以负重'));
      blocks.push(acc('pushdown', '辅助 · 三头绳索 / 直杆下压', 4, '12', 'RPE 8'));
      blocks.push(acc('hammer', '辅助 · 锤式弯举', 4, '15', 'RPE 8'));
      blocks.push(acc('curl', '辅助 · 哑铃 / 杠铃弯举', 4, '12', 'RPE 8'));
    }
  }

  let out = blocks;
  if (r === 'tired') {
    out = blocks.filter((b) => !b.optional).map((b) => (b.type === 'sets' && b.key !== 'var' ? { ...b, sets: Math.max(2, b.sets - 1) } : b));
    notes.push('疲劳模式：辅助动作各减 1 组，可选动作跳过；主项按 RPE 下限完成');
  } else if (r === 'short') {
    out = blocks.filter((b) => b.type === 'main' || b.key === 'var');
    notes.push('时间紧：只做主项（和五选一），辅助动作今天跳过');
  } else if (r === 'great') notes.push('状态好：主项可以按 RPE 上限完成，但不要随意加重');
  if (W.taper) notes.push('测试前减量周：重量轻是为了下周测极限时状态最好');
  notes.push('其他部位照常训练，但别上太大重量，避免影响卧推进度');
  return { pos, week: W, sessionId: sid, blocks: out, notes, kind: 'upper' };
}

/* ---------- nutrition ---------- */
const GOALS = {
  bulk: { label: '增肌', kcal: 250, protein: 2.0, fat: 0.9 },
  cut: { label: '减脂', kcal: -450, protein: 2.2, fat: 0.8 },
  maintain: { label: '维持', kcal: 0, protein: 1.8, fat: 0.9 },
};
/**
 * kind: 'rest' | 'upper' | 'lower'. BMR via Mifflin-St Jeor × lifestyle factor, plus the
 * session's burn (heavy squat/deadlift days cost more), plus the goal adjustment.
 * Protein and fat per kg; carbs fill the rest, so heavy lower days get the most carbs.
 */
function nutritionFor(st, kind) {
  const p = st.profile;
  const g = GOALS[p.goal] || GOALS.maintain;
  if (isMike(st)) {
    // Plan rules: carbs 3.5–5 g/kg, protein 1.5–1.8 g/kg, fat 0.5 g/kg
    const train = kind !== 'rest';
    const carbKg = { bulk: train ? 5 : 4, maintain: train ? 4.5 : 3.5, cut: train ? 3.5 : 3 }[p.goal] || 4;
    const protein = Math.round(p.weight * (p.goal === 'maintain' ? 1.6 : 1.8));
    const fat = Math.round(p.weight * 0.5);
    const carbs = Math.round(p.weight * carbKg);
    const water = Math.round((p.weight * 35 + (train ? 600 : 0)) / 100) * 100;
    return { kcal: Math.round((protein * 4 + carbs * 4 + fat * 9) / 10) * 10, protein, fat, carbs, water, kind, training: train, goal: g, rule: 'mike' };
  }
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const burn = kind === 'lower' ? 5 * p.weight : kind === 'upper' ? 3.5 * p.weight : 0;
  const kcal = Math.round((bmr * p.activity + burn + g.kcal) / 10) * 10;
  const protein = Math.round(p.weight * g.protein);
  const fat = Math.round(p.weight * (kind === 'rest' ? g.fat + 0.1 : g.fat));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const water = Math.round((p.weight * 35 + (kind === 'rest' ? 0 : 600)) / 100) * 100;
  return { kcal, protein, fat, carbs, water, kind, training: kind !== 'rest', goal: g };
}
function mealsFor(st, n) {
  const t = toMin(st.trainTime);
  const meals = !n.training
    ? [
        { key: 'b', name: '早餐', time: '07:30', pct: 0.25, food: '燕麦 + 鸡蛋 2–3 个 + 牛奶/豆浆 + 水果' },
        { key: 'l', name: '午餐', time: '12:00', pct: 0.35, food: '米饭/杂粮 + 鸡胸/牛肉/鱼 + 大量蔬菜' },
        { key: 's', name: '下午加餐', time: '15:30', pct: 0.1, food: '希腊酸奶 + 一把坚果' },
        { key: 'd', name: '晚餐', time: '18:30', pct: 0.3, food: '鱼/虾/豆腐 + 蔬菜 + 少量主食，脂肪可略多（橄榄油、牛油果）' },
      ]
    : [
        { key: 'b', name: '早餐', time: '07:30', pct: 0.25, food: '燕麦/全麦面包 + 鸡蛋 2–3 个 + 牛奶' },
        { key: 'l', name: '午餐', time: '12:00', pct: 0.3, food: '米饭/面 + 瘦肉/鸡胸 + 蔬菜' },
        { key: 'pre', name: '练前加餐', time: fromMin(t - 90), pct: 0.15, food: '香蕉 + 面包/米糕 + 少量蛋白（低脂、易消化）' },
        { key: 'post', name: '练后餐', time: fromMin(t + 90), pct: 0.3, food: '蛋白粉/鸡胸/鱼 + 米饭/土豆/面（高碳水 + 高蛋白，低脂）' },
      ];
  return meals.map((m) => ({
    ...m, protein: Math.round(n.protein * m.pct), carbs: Math.round(n.carbs * m.pct),
    fat: Math.round(n.fat * m.pct), kcal: Math.round(n.kcal * m.pct),
  })).sort((a, b) => toMin(a.time) - toMin(b.time));
}
function nutritionTips(n) {
  const tips = [];
  if (n.rule === 'mike') tips.push('Mike 卧推增力计划的饮食：碳水 3.5–5 g/kg 体重，蛋白质 1.5–1.8 g/kg，脂肪 0.5 g/kg，分 3–4 餐吃完，误差 10% 以内都可以。');
  if (n.kind === 'lower') tips.push('今天是大重量下肢日，碳水最高：练前 1–2 小时吃够主食，练后补足碳水和蛋白。');
  if (n.kind === 'upper') tips.push('上肢日：碳水适中，集中在练前和练后。');
  if (!n.training) tips.push('休息日：碳水降低、蛋白质不变，多吃蔬菜和健康脂肪。');
  if (n.training) tips.push(`练后 2 小时内吃 25–40g 优质蛋白；训练中补水约 500ml，全天 ${n.water}ml。`);
  if (n.goal === GOALS.cut) tips.push('减脂期力量可能停滞，TM 不涨属正常，优先保证蛋白质。');
  if (n.goal === GOALS.bulk) tips.push('增肌期每周体重增长 0.25–0.5kg 为宜，太快就减 100–200 千卡。');
  tips.push('每天睡 7–9 小时——5/3/1 的进步一半靠恢复。');
  return tips;
}

/* ---------- text summaries (notifications / calendar) ---------- */
function sessionSummary(st, date, sessionId, readiness) {
  const s = buildSession(st, date, sessionId, { readiness });
  if (!s) return '';
  return s.blocks.map((b) => {
    if (b.type === 'main') return `${b.title}：${b.rows.map((x) => `${fmtW(x.w)}×${x.reps}${x.plus ? '+' : ''}`).join(' / ')}`;
    return `${b.title}：${b.w ? `${fmtW(b.w)}kg ` : ''}${b.sets}×${b.reps}`;
  }).join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = { dateKey, parseKey, addDays, dayDiff, weekdayIdx, mondayOf, roundTo, fmtW, epley, baseTM, tmFor,
    position, recommend, remainingPlan, buildSession, pickExercises, candidates, ranked, nutritionFor, mealsFor,
    variantOf, sessionSummary, scheduledFor, orderFor, requiredFor, doneSessions, doneOn,
    progOf, isMike, programOfSession, isTestWeek, weekName, asProgram, mikeMax, buildMike };
}
