// Run: node tests/mike.test.js — Mike 卧推增力计划 against the plan spreadsheets
const assert = require('assert');
const E = require('../js/engine.js');
const S = require('../js/stats.js');

const st = {
  program: 'mike', mike: { bench1RM: 100, cg1RM: 0, variant: 'pause' },
  lifts: { press: { variant: 'ohp', oneRM: 60 }, deadlift: { variant: 'conv_dl', oneRM: 150 }, bench: { variant: 'bb_bench', oneRM: 100 }, squat: { variant: 'bb_squat', oneRM: 140 } },
  plateInc: 2.5, tests: {}, startDate: '2026-10-12', schedule: [0, 3], programs: {},
  equipment: [], injuries: [], excluded: [], favorites: [], customEx: [], logs: {},
  profile: { sex: 'male', age: 25, height: 175, weight: 80, activity: 1.35, goal: 'maintain' }, trainTime: '18:30',
};
const day = (week, wd) => E.addDays(E.parseKey(st.startDate), (week - 1) * 7 + wd);
const build = (week, sid, opts) => E.buildSession(st, day(week, sid === 'mike2' ? 3 : 0), sid, opts);
const main = (s) => s.blocks.find((b) => b.type === 'main');

assert.strictEqual(E.position(st, day(16, 0)).week, 16);
assert.strictEqual(E.position(st, day(17, 0)).cycle, 1);
assert.deepStrictEqual(E.orderFor(1, st), ['mike1', 'mike2']);
assert.deepStrictEqual(E.orderFor(16, st), ['mikeTest']);

// 容量储备期 week 1: bench 4×8 @65% ; week 4: 4×6 @77%
let m = main(build(1, 'mike1'));
assert.deepStrictEqual(m.rows.map((r) => [r.w, r.reps]), [[65, 8], [65, 8], [65, 8], [65, 8]]);
assert.deepStrictEqual(main(build(4, 'mike1')).rows.map((r) => r.w), [77.5, 77.5, 77.5, 77.5]);
assert.ok(build(1, 'mike1').blocks.some((b) => b.title.includes('蝴蝶机夹胸')));
// Day2 week 1: close-grip 1RM defaults to 90% of bench (90) → 2×8 @65% then 2×8 −10%
m = main(build(1, 'mike2'));
assert.deepStrictEqual(m.rows.map((r) => r.w), [57.5, 57.5, 52.5, 52.5]);

// 力量储备期 week 1 (overall week 5): bench 3×5 @70%; pause bench 3×6 @80% of 70 with 1-second pauses
let s = build(5, 'mike1');
assert.deepStrictEqual(main(s).rows.map((r) => [r.w, r.reps]), [[70, 5], [70, 5], [70, 5]]);
let v = s.blocks.find((b) => b.key === 'var');
assert.strictEqual(v.w, 55); assert.strictEqual(v.reps, '6'); assert.strictEqual(v.sets, 3);
// 2-second pauses → 4 reps (week 9), 3-second → 2 reps (week 13); other variants are always 6
assert.strictEqual(build(9, 'mike1').blocks.find((b) => b.key === 'var').reps, '4');
assert.strictEqual(build(13, 'mike1').blocks.find((b) => b.key === 'var').reps, '2');
assert.strictEqual(E.buildSession({ ...st, mike: { ...st.mike, variant: 'spoto' } }, day(13, 0), 'mike1').blocks.find((b) => b.key === 'var').reps, '6');
// week 14 (储备期第 10 周): 3×1 @95%; week 15 taper: bench 5×5 @70%, close-grip @60%
assert.deepStrictEqual(main(build(14, 'mike1')).rows.map((r) => [r.w, r.reps]), [[95, 1], [95, 1], [95, 1]]);
assert.strictEqual(main(build(15, 'mike1')).rows.length, 5);
assert.strictEqual(main(build(15, 'mike2')).rows[0].w, 55); // 90 × 60% = 54 → 55
// week 16: test ladder
s = build(16, 'mikeTest');
assert.ok(s.test); assert.deepStrictEqual(main(s).rows.map((r) => r.w), [20, 40, 60, 80, 92.5, 102.5]);

// Readiness: tired drops optional work, short keeps only main (+ variant)
assert.ok(!build(1, 'mike1', { readiness: 'tired' }).blocks.some((b) => b.optional));
assert.deepStrictEqual(build(5, 'mike1', { readiness: 'short' }).blocks.map((b) => b.key), ['main', 'var']);

// Next cycle uses the tested 1RM; close-grip scales with it
const st2 = { ...st, tests: { 0: { bench: 110 } } };
assert.strictEqual(E.mikeMax(st2, 1, 'bench'), 110);
assert.strictEqual(E.mikeMax(st2, 1, 'cg'), 99);

// Schedule: Monday = 第一推, Thursday = 第二推, Tuesday rest
assert.strictEqual(E.recommend(st, day(1, 0)).session, 'mike1');
const afterMon = { ...st, logs: { [E.dateKey(day(1, 0))]: { session: 'mike1', done: true } } };
assert.strictEqual(E.recommend(afterMon, day(1, 1)).session, 'rest');
assert.strictEqual(E.recommend(st, day(1, 1)).session, 'mike1'); // Monday missed → catch up (only Thursday left)
assert.strictEqual(E.recommend(afterMon, day(1, 3)).session, 'mike2');

// Nutrition follows the plan's rules (80kg, maintain): carbs 4.5 g/kg training / 3.5 rest, fat 0.5 g/kg
const nT = E.nutritionFor(st, 'upper'), nR = E.nutritionFor(st, 'rest');
assert.strictEqual(nT.carbs, 360); assert.strictEqual(nR.carbs, 280); assert.strictEqual(nT.fat, 40);

// History keeps 5/3/1 workouts after switching to Mike
const mixed = { ...st, programs: { '531': { startDate: '2026-09-14', schedule: [0, 1, 3, 4], tests: {} } },
  logs: { '2026-09-14': { session: 'press', done: true }, '2026-10-12': { session: 'mike1', done: true } } };
const hist = S.trainingHistory(mixed);
assert.deepStrictEqual(hist.map((h) => [h.program, h.session, h.pos.week]), [['531', 'press', 1], ['mike', 'mike1', 1]]);
assert.strictEqual(S.weekly(mixed, E.parseKey('2026-10-13'))[0].app, 1); // weekly stats only count the active program

console.log('all mike tests passed');
