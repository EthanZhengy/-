// Run: node tests/engine.test.js
const assert = require('assert');
const E = require('../js/engine.js');

const st = {
  lifts: { press: { variant: 'ohp', oneRM: 65 }, deadlift: { variant: 'conv_dl', oneRM: 150 },
           bench: { variant: 'bb_bench', oneRM: 100 }, squat: { variant: 'bb_squat', oneRM: 140 } },
  plateInc: 2.5, tests: {}, startDate: '2026-10-12', schedule: [0, 1, 3, 4],
  equipment: ['barbell', 'rack', 'bench', 'dumbbell', 'pullup', 'dip', 'cable', 'machine', 'band'],
  injuries: [], excluded: [], favorites: [], customEx: [], logs: {},
  profile: { sex: 'male', age: 25, height: 175, weight: 70, activity: 1.35, goal: 'bulk' }, trainTime: '18:30',
};
const day = (week, wd) => E.addDays(E.parseKey(st.startDate), (week - 1) * 7 + wd);
const main = (week, s) => E.buildSession(st, day(week, 0), s).blocks[0].rows.map((r) => r.w);

// TM = 90% 1RM, +2.5 / +5 at weeks 5 and 9 (matches the images: press 58.5 → 61 → 63.5)
assert.strictEqual(E.tmFor(st, 0, 1, 'press'), 58.5);
assert.strictEqual(E.tmFor(st, 0, 5, 'press'), 61);
assert.strictEqual(E.tmFor(st, 0, 9, 'deadlift'), 145);

// Week 1 deadlift: 95/105/115 (+135 single) as in the image
assert.deepStrictEqual(main(1, 'deadlift'), [95, 107.5, 122.5, 135]);
// Week 9 bench: 70/80/90% of 95 + 100%/110% singles
assert.deepStrictEqual(main(9, 'bench'), [67.5, 75, 85, 95, 105]);
// Press never gets the extra singles, gets "+" on last set instead
const p9 = E.buildSession(st, day(9, 0), 'press').blocks[0].rows;
assert.strictEqual(p9.length, 3); assert.ok(p9[2].plus);
// Week 10 bench uses the real TM (the image's 65/75/85kg was a typo)
assert.deepStrictEqual(main(10, 'bench'), [62.5, 72.5, 80]);

// Secondary: month 1 = 5 sets, deadlift ×5; deload week 4 = 3×10 (deadlift 3×8)
const w1 = E.buildSession(st, day(1, 4), 'squat').blocks.find((b) => b.key === 'sec');
assert.strictEqual(w1.sets, 5); assert.strictEqual(w1.reps, '5'); assert.strictEqual(w1.w, 95);
const w4 = E.buildSession(st, day(4, 0), 'press').blocks.find((b) => b.key === 'sec');
assert.strictEqual(w4.reps, '10'); assert.strictEqual(w4.sets, 3);

// Week 11: no secondary / pull / accessories. Week 12: test ladder.
assert.strictEqual(E.buildSession(st, day(11, 0), 'press').blocks.length, 1);
assert.ok(E.buildSession(st, day(12, 0), 'deadlift').test);

// Accessories: two, different muscles; tired = 1; short = 0
const s1 = E.buildSession(st, day(1, 0), 'press');
const acc = s1.blocks.filter((b) => b.key.startsWith('acc'));
assert.strictEqual(acc.length, 2); assert.notStrictEqual(acc[0].ex.m, acc[1].ex.m);
assert.strictEqual(E.buildSession(st, day(1, 0), 'press', { readiness: 'tired' }).blocks.filter((b) => b.key.startsWith('acc')).length, 1);
assert.strictEqual(E.buildSession(st, day(1, 0), 'press', { readiness: 'short' }).blocks.filter((b) => b.key.startsWith('acc')).length, 0);
// Lower-back injury removes barbell rows / good mornings / ab wheel everywhere
const inj = { ...st, injuries: ['lowerBack'] };
['pull', 'core', 'lower'].forEach((slot) =>
  E.candidates(inj, slot).forEach((e) => assert.ok(!['bb_row', 'tbar_row', 'good_morning', 'ab_wheel'].includes(e.id))));
// With a lower-back injury, back-loading accessories are not auto-picked
for (let w = 1; w <= 10; w++) ['deadlift', 'squat'].forEach((sid) => E.buildSession(inj, day(w, 4), sid).blocks
  .forEach((b) => assert.ok(!(b.ex && b.ex.back), `week ${w} ${sid}: ${b.ex && b.ex.name}`)));
// Favourites get picked
const fav = { ...st, favorites: ['hammer'] };
assert.ok(E.buildSession(fav, day(1, 0), 'press').blocks.some((b) => b.ex && b.ex.id === 'hammer'));

// Recommendation: Tuesday is deadlift day; if squat was done Monday, Tuesday switches to an upper day
assert.strictEqual(E.recommend(st, day(1, 1)).session, 'deadlift');
const moved = { ...st, logs: { [E.dateKey(day(1, 0))]: { session: 'squat', done: true } } };
const rec = E.recommend(moved, day(1, 1));
assert.ok(['press', 'bench'].includes(rec.session), rec.reason);
const rp = E.remainingPlan(moved, day(1, 1), rec.session);
assert.strictEqual(rp.plan.length, 2); assert.strictEqual(rp.unplaced.length, 0);

// Next cycle: tested 1RMs → TM 90%; untested lifts keep progressing
const c2 = { ...st, tests: { 0: { bench: 110 } } };
assert.strictEqual(E.baseTM(c2, 1, 'bench'), 99);
assert.strictEqual(E.baseTM(c2, 1, 'press'), 58.5 + 7.5);

console.log('all engine tests passed');
