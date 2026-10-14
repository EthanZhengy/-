// Run: node tests/stats.test.js
const assert = require('assert');
const E = require('../js/engine.js');
const S = require('../js/stats.js');

const st = {
  lifts: { press: { variant: 'ohp', oneRM: 65 }, deadlift: { variant: 'conv_dl', oneRM: 150 },
           bench: { variant: 'bb_bench', oneRM: 100 }, squat: { variant: 'bb_squat', oneRM: 140 } },
  plateInc: 2.5, tests: {}, startDate: '2026-09-21', schedule: [0, 1, 3, 4],
  equipment: ['barbell', 'rack', 'bench', 'dumbbell', 'pullup', 'dip', 'cable', 'machine', 'band'],
  injuries: [], excluded: [], favorites: [], customEx: [], logs: {},
};
const today = E.parseKey('2026-10-14'); // Wednesday of week 4

// Weeks 1–3 done outside the app
for (let w = 0; w < 3; w++) E.orderFor(w + 1).forEach((s) => assert.ok(S.markOffline(st, w, s, today)));
// Week 4: press done in the app with an AMRAP-free deload, deadlift offline
st.logs['2026-10-12'] = { session: 'press', done: true, sets: {}, amrap: {} };
assert.ok(S.markOffline(st, 3, 'deadlift', today));
// Can't mark a session offline on a future day only: bench is scheduled Thu, gets moved to a past free day
assert.ok(S.markOffline(st, 3, 'bench', today));
assert.ok(Object.keys(st.logs).every((k) => k <= '2026-10-14'));

assert.strictEqual(S.sessionStatus(st, 0, 'squat', today).status, 'offline');
assert.strictEqual(S.sessionStatus(st, 3, 'press', today).status, 'app');
assert.strictEqual(S.sessionStatus(st, 3, 'squat', today).status, 'upcoming');

const wk = S.weekly(st, today);
assert.strictEqual(wk.length, 4);
assert.deepStrictEqual(wk.map((w) => w.app + w.offline), [4, 4, 4, 3]);
assert.strictEqual(S.streak(wk), 3);
assert.ok(wk[0].offlineVolume > 0 && wk[3].appVolume > 0);

// AMRAP reps produce an e1RM point
st.logs['2026-09-22'] = { session: 'deadlift', done: true, sets: {}, amrap: { 'deadlift:main:2': 6 } };
const hist = S.trainingHistory(st);
const pts = S.e1rmSeries(hist, 'deadlift');
assert.strictEqual(pts.length, 1);
assert.strictEqual(pts[0].value, Math.round(E.epley(122.5, 6) * 2) / 2);

// Unmark
S.unmarkOffline(st, 0, 'squat');
assert.strictEqual(S.sessionStatus(st, 0, 'squat', today).status, 'missed');
assert.strictEqual(S.streak(S.weekly(st, today)), 2);

console.log('all stats tests passed');
