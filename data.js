'use strict';
/* Static data: the 12-week 5/3/1 program, main-lift variants and the accessory library. */

const LIFTS = ['press', 'deadlift', 'bench', 'squat'];
const LIFT_NAMES = { press: '推举', deadlift: '硬拉', bench: '卧推', squat: '深蹲' };
// TM increment applied at the start of week 5 and week 9 (and each new cycle).
const TM_INC = { press: 2.5, bench: 2.5, deadlift: 5, squat: 5 };
const LOWER = { deadlift: true, squat: true };

/**
 * One training session per main lift, as in the program:
 * Mon press(+bench), Tue deadlift(+squat), Thu bench(+press), Fri squat(+deadlift).
 */
const SESSIONS = {
  press: { main: 'press', secondary: 'bench', slot: 'pull', acc: 'upper' },
  deadlift: { main: 'deadlift', secondary: 'squat', slot: 'core', acc: 'lower' },
  bench: { main: 'bench', secondary: 'press', slot: 'pull', acc: 'upper' },
  squat: { main: 'squat', secondary: 'deadlift', slot: 'core', acc: 'lower' },
};
const SESSION_ORDER = ['press', 'deadlift', 'bench', 'squat'];
const TEST_ORDER = ['deadlift', 'bench', 'squat', 'press']; // week 12; press test is optional
const SESSION_LABEL = { press: '推举日', deadlift: '硬拉日', bench: '卧推日', squat: '深蹲日' };

/**
 * Week definitions transcribed from the "3个月力量训练挑战计划".
 * main: [percent of TM, reps]. lastPlus: who does "+" (as many as possible, not to failure) on the last main set.
 * extra: top singles after the main sets — never on press, which instead gets "+" on its last set.
 * sec: secondary lift at the first-set percentage. pc: sets for the pull / core slot. acc: accessory count.
 */
const WEEKS = [
  { name: '高难度 3 次组', main: [[70, 3], [80, 3], [90, 3]], lastPlus: 'all', extra: [[100, 1, false]],
    sec: { pct: 70, sets: 5, reps: '5-8', dlReps: '5' }, pc: 5, acc: 2 },
  { name: '中等难度 5 次组', main: [[65, 5], [75, 5], [85, 5]], lastPlus: 'none', extra: [],
    sec: { pct: 65, sets: 5, reps: '5-8', dlReps: '5' }, pc: 5, acc: 2 },
  { name: '高难度 5/3/1 组', main: [[75, 5], [85, 3], [95, 1]], lastPlus: 'all', extra: [[100, 1, false]],
    sec: { pct: 75, sets: 5, reps: '5-8', dlReps: '5' }, pc: 5, acc: 2 },
  { name: '减载周', deload: true, main: [[50, 5], [60, 5], [70, 5]], lastPlus: 'none', extra: [],
    sec: { pct: 50, sets: 3, reps: '10', dlReps: '8' }, pc: 3, acc: 1 },
  { name: '高难度 3 次组 + 全力组', main: [[70, 3], [80, 3], [90, 3]], lastPlus: 'press', extra: [[100, 1, true]],
    sec: { pct: 70, sets: 3, reps: '5-8', dlReps: '5' }, pc: 3, acc: 2 },
  { name: '中等难度 5 次组', main: [[65, 5], [75, 5], [85, 5]], lastPlus: 'none', extra: [],
    sec: { pct: 65, sets: 3, reps: '5-8', dlReps: '5' }, pc: 3, acc: 2 },
  { name: '高难度 5/3/1 组 + 全力组', main: [[75, 5], [85, 3], [95, 1]], lastPlus: 'press', extra: [[100, 1, true]],
    sec: { pct: 75, sets: 3, reps: '5-8', dlReps: '5' }, pc: 3, acc: 2 },
  { name: '减载周', deload: true, main: [[50, 5], [60, 5], [70, 5]], lastPlus: 'none', extra: [],
    sec: { pct: 50, sets: 3, reps: '8', dlReps: '5' }, pc: 3, acc: 1 },
  { name: '高难度 3 次组 + 极限单次组', main: [[70, 3], [80, 3], [90, 3]], lastPlus: 'press', extra: [[100, 1, false], [110, 1, false]],
    sec: { pct: 70, sets: 3, reps: '5-8', dlReps: '5' }, pc: 3, acc: 2 },
  { name: '中等难度 5 次组', main: [[65, 5], [75, 5], [85, 5]], lastPlus: 'none', extra: [],
    sec: { pct: 65, sets: 3, reps: '5-8', dlReps: '5' }, pc: 3, acc: 2 },
  { name: '5/3/1 组（不做辅助）', main: [[75, 5], [85, 3], [95, 1]], lastPlus: 'none', extra: [],
    sec: null, pc: 0, acc: 0, note: '完成规定次数即可，不做任何辅助训练，给第 12 周测极限做缓冲。' },
  { name: '极限测试周', test: true },
];

/* Equipment tokens. A requirement "a|b" means either one is enough. */
const EQUIPMENT = {
  barbell: '杠铃 + 杠铃片', rack: '深蹲架', bench: '卧推凳', dumbbell: '哑铃', pullup: '单杠 / 引体架',
  dip: '双杠', cable: '龙门架 / 绳索', machine: '固定器械（腿弯举、腿屈伸、器械划船等）',
  band: '弹力带', trapbar: '六角杠铃', ssb: '安全深蹲杠', legpress: '腿举机',
};
const INJURIES = { shoulder: '肩', lowerBack: '腰 / 下背', knee: '膝', elbow: '肘', wrist: '手腕' };

/**
 * Main-lift variants. inc = loading increment ('bar' uses the user's plate increment).
 * fix: injuries this variant is the preferred substitute for. avoid: injuries it aggravates.
 */
const VARIANTS = {
  press: [
    { id: 'ohp', name: '杠铃站姿推举', eq: ['barbell', 'rack'], inc: 'bar', avoid: ['shoulder', 'lowerBack', 'wrist', 'elbow'] },
    { id: 'seated_ohp', name: '坐姿杠铃推举', eq: ['barbell', 'rack', 'bench'], inc: 'bar', fix: ['lowerBack'], avoid: ['shoulder', 'elbow'] },
    { id: 'landmine', name: '单臂地雷推举', eq: ['barbell'], inc: 'bar', fix: ['shoulder', 'elbow'], avoid: [] },
    { id: 'db_ohp', name: '坐姿哑铃推举（单只重量）', eq: ['dumbbell', 'bench'], inc: 2, fix: ['wrist', 'lowerBack'], avoid: ['shoulder'] },
  ],
  bench: [
    { id: 'bb_bench', name: '杠铃卧推', eq: ['barbell', 'bench'], inc: 'bar', avoid: ['shoulder', 'wrist', 'elbow'] },
    { id: 'db_bench', name: '哑铃卧推（单只重量）', eq: ['dumbbell', 'bench'], inc: 2, fix: ['shoulder', 'wrist', 'elbow'], avoid: [] },
    { id: 'floor_press', name: '杠铃地板卧推', eq: ['barbell'], inc: 'bar', fix: ['shoulder'], avoid: ['wrist'] },
  ],
  squat: [
    { id: 'bb_squat', name: '杠铃深蹲', eq: ['barbell', 'rack'], inc: 'bar', avoid: ['shoulder', 'lowerBack', 'knee', 'wrist', 'elbow'] },
    { id: 'ssb_squat', name: '安全杠深蹲', eq: ['ssb', 'rack'], inc: 'bar', fix: ['shoulder', 'wrist', 'elbow'], avoid: ['knee'] },
    { id: 'box_squat', name: '箱式深蹲', eq: ['barbell', 'rack', 'bench'], inc: 'bar', fix: ['knee'], avoid: ['shoulder', 'wrist'] },
    { id: 'front_squat', name: '杠铃前蹲', eq: ['barbell', 'rack'], inc: 'bar', fix: [], avoid: ['knee', 'wrist'] },
    { id: 'leg_press', name: '腿举', eq: ['legpress'], inc: 5, fix: ['lowerBack'], avoid: [] },
    { id: 'goblet', name: '高脚杯深蹲（哑铃）', eq: ['dumbbell'], inc: 2, fix: ['lowerBack', 'shoulder', 'wrist'], avoid: ['knee'] },
  ],
  deadlift: [
    { id: 'conv_dl', name: '传统硬拉', eq: ['barbell'], inc: 'bar', avoid: ['lowerBack'] },
    { id: 'trap_dl', name: '六角杠铃硬拉', eq: ['trapbar'], inc: 'bar', fix: ['lowerBack'], avoid: [] },
    { id: 'sumo_dl', name: '相扑硬拉', eq: ['barbell'], inc: 'bar', fix: [], avoid: ['knee'] },
    { id: 'rack_pull', name: '架上拉（膝下高度）', eq: ['barbell', 'rack'], inc: 'bar', fix: ['lowerBack', 'knee'], avoid: [] },
    { id: 'db_rdl', name: '哑铃罗马尼亚硬拉（单只重量）', eq: ['dumbbell'], inc: 2, fix: ['lowerBack'], avoid: [] },
  ],
};

/**
 * Accessory library. slot: pull / core / upper (press & bench days) / lower (deadlift & squat days).
 * m: muscle group, used for balancing and for day-specific preferences.
 * back: loads the lower back (avoided when the back is already fatigued or the next day is a lower-body day).
 */
const EXERCISES = [
  // 拉类
  { id: 'pullup', name: '引体向上', slot: 'pull', m: 'vert', eq: ['pullup'], reps: '6-12' },
  { id: 'lat_pd', name: '高位下拉', slot: 'pull', m: 'vert', eq: ['cable'], reps: '10-15' },
  { id: 'band_pd', name: '弹力带下拉', slot: 'pull', m: 'vert', eq: ['band'], reps: '12-15' },
  { id: 'db_row', name: '单臂哑铃划船', slot: 'pull', m: 'horiz', eq: ['dumbbell', 'bench'], reps: '10-12/侧' },
  { id: 'bb_row', name: '杠铃划船', slot: 'pull', m: 'horiz', eq: ['barbell'], back: true, avoid: ['lowerBack'], reps: '8-12' },
  { id: 'tbar_row', name: 'T 杠划船', slot: 'pull', m: 'horiz', eq: ['barbell'], back: true, avoid: ['lowerBack'], reps: '10-12' },
  { id: 'chest_row', name: '胸部支撑划船', slot: 'pull', m: 'horiz', eq: ['dumbbell', 'bench'], reps: '10-15' },
  { id: 'cable_row', name: '坐姿绳索划船', slot: 'pull', m: 'horiz', eq: ['cable'], reps: '10-15' },
  { id: 'machine_row', name: '坐姿器械划船', slot: 'pull', m: 'horiz', eq: ['machine'], reps: '10-15' },
  { id: 'inverted_row', name: '反向划船（杠铃架）', slot: 'pull', m: 'horiz', eq: ['rack', 'barbell'], reps: '10-15' },
  { id: 'band_row', name: '弹力带划船', slot: 'pull', m: 'horiz', eq: ['band'], reps: '15' },

  // 腹肌核心: stab = anti-movement (spine-friendly, good after heavy deadlifts), dyn = dynamic
  { id: 'ab_wheel', name: '健腹轮', slot: 'core', m: 'dyn', eq: [], avoid: ['lowerBack'], reps: '8-15' },
  { id: 'hanging_lr', name: '悬垂举腿', slot: 'core', m: 'dyn', eq: ['pullup'], avoid: ['shoulder'], reps: '10-15' },
  { id: 'db_sidebend', name: '哑铃侧弯', slot: 'core', m: 'dyn', eq: ['dumbbell'], reps: '12-20/侧' },
  { id: 'weighted_situp', name: '负重仰卧起坐', slot: 'core', m: 'dyn', eq: [], avoid: ['lowerBack'], reps: '15-30' },
  { id: 'cable_crunch', name: '绳索卷腹', slot: 'core', m: 'dyn', eq: ['cable'], reps: '12-20' },
  { id: 'plank', name: '平板支撑', slot: 'core', m: 'stab', eq: [], avoid: ['shoulder'], reps: '30-60 秒' },
  { id: 'side_plank', name: '侧平板支撑', slot: 'core', m: 'stab', eq: [], avoid: ['shoulder'], reps: '30-45 秒/侧' },
  { id: 'dead_bug', name: '死虫式', slot: 'core', m: 'stab', eq: [], reps: '10-12/侧' },
  { id: 'pallof', name: '抗旋转推（Pallof）', slot: 'core', m: 'stab', eq: ['cable|band'], reps: '10-12/侧' },

  // 推举 / 卧推日辅助
  { id: 'tri_pushdown', name: '肱三头肌下压', slot: 'upper', m: 'tri', eq: ['cable|band'], reps: '12-20' },
  { id: 'oh_ext', name: '肱三头肌过头屈伸', slot: 'upper', m: 'tri', eq: ['cable|dumbbell'], avoid: ['elbow', 'shoulder'], reps: '12-15' },
  { id: 'skull', name: '仰卧臂屈伸', slot: 'upper', m: 'tri', eq: ['dumbbell', 'bench'], avoid: ['elbow'], reps: '10-15' },
  { id: 'dips', name: '双杠臂屈伸', slot: 'upper', m: 'tri', eq: ['dip'], avoid: ['shoulder', 'elbow'], reps: '8-15' },
  { id: 'cg_pushup', name: '窄距俯卧撑', slot: 'upper', m: 'tri', eq: [], avoid: ['wrist'], reps: '10-20' },
  { id: 'db_curl', name: '哑铃弯举', slot: 'upper', m: 'bi', eq: ['dumbbell'], reps: '10-15' },
  { id: 'hammer', name: '锤式弯举', slot: 'upper', m: 'bi', eq: ['dumbbell'], reps: '10-15' },
  { id: 'bb_curl', name: '杠铃弯举', slot: 'upper', m: 'bi', eq: ['barbell'], avoid: ['wrist', 'elbow'], reps: '10-12' },
  { id: 'cable_curl', name: '绳索弯举', slot: 'upper', m: 'bi', eq: ['cable|band'], reps: '12-15' },
  { id: 'face_pull', name: '面拉', slot: 'upper', m: 'rear', eq: ['cable|band'], reps: '15-20' },
  { id: 'rear_fly', name: '哑铃俯身侧平举', slot: 'upper', m: 'rear', eq: ['dumbbell'], reps: '15-20' },
  { id: 'band_pa', name: '弹力带拉开', slot: 'upper', m: 'rear', eq: ['band'], reps: '20-30' },
  { id: 'lat_raise', name: '哑铃侧平举', slot: 'upper', m: 'side', eq: ['dumbbell'], avoid: ['shoulder'], reps: '12-20' },
  { id: 'cable_lat', name: '绳索侧平举', slot: 'upper', m: 'side', eq: ['cable'], reps: '12-20/侧' },

  // 硬拉 / 深蹲日辅助
  { id: 'lunge', name: '箭步蹲', slot: 'lower', m: 'quad', eq: ['dumbbell'], avoid: ['knee'], reps: '10-12/腿' },
  { id: 'bss', name: '单腿深蹲（保加利亚分腿蹲）', slot: 'lower', m: 'quad', eq: ['dumbbell', 'bench'], avoid: ['knee'], reps: '8-12/腿' },
  { id: 'leg_ext', name: '腿屈伸', slot: 'lower', m: 'quad', eq: ['machine'], reps: '12-20' },
  { id: 'leg_curl', name: '腿弯举', slot: 'lower', m: 'ham', eq: ['machine'], reps: '10-15' },
  { id: 'db_rdl_acc', name: '哑铃罗马尼亚硬拉', slot: 'lower', m: 'ham', eq: ['dumbbell'], back: true, reps: '10-12' },
  { id: 'back_ext', name: '山羊挺身', slot: 'lower', m: 'back', eq: ['machine'], back: true, reps: '12-15' },
  { id: 'good_morning', name: '早安式', slot: 'lower', m: 'ham', eq: ['barbell', 'rack'], back: true, avoid: ['lowerBack'], reps: '8-12' },
  { id: 'pull_through', name: '绳索髋屈伸', slot: 'lower', m: 'glute', eq: ['cable|band'], reps: '12-15' },
  { id: 'hip_thrust', name: '臀推', slot: 'lower', m: 'glute', eq: ['barbell', 'bench'], reps: '10-12' },
  { id: 'glute_bridge', name: '单腿臀桥', slot: 'lower', m: 'glute', eq: [], reps: '12-15/腿' },
  { id: 'calf', name: '提踵', slot: 'lower', m: 'calf', eq: [], reps: '15-20' },
  { id: 'farmer', name: '握力练习（农夫行走）', slot: 'lower', m: 'grip', eq: ['dumbbell'], reps: '30-40 米' },
  { id: 'dead_hang', name: '握力练习（单杠悬挂）', slot: 'lower', m: 'grip', eq: ['pullup'], avoid: ['shoulder'], reps: '30-60 秒' },
];

const SLOT_NAMES = { pull: '拉类动作', core: '腹肌核心', upper: '上肢辅助', lower: '下肢辅助' };

/**
 * How well each muscle group fits as an accessory on each session, given what the
 * main + secondary lifts already fatigued. Positive = good fit.
 */
const DAY_FIT = {
  // Press + bench: delts and triceps already worked hard → favour rear delts / biceps.
  press: { rear: 2, bi: 1, side: 0, tri: 0, vert: 0, horiz: 2 },
  // Bench + press: triceps lockout is the bench limiter → favour triceps, balance with rear delts.
  bench: { tri: 2, rear: 1, side: 1, bi: 0, vert: 2, horiz: 0 },
  // Deadlift + squat: posterior chain, grip and quads are smoked → calves, glutes, spine-friendly core.
  deadlift: { calf: 2, glute: 1, quad: 0, ham: -1, grip: -1, back: -3, stab: 2, dyn: 0 },
  // Squat + light deadlift: quads done → hamstrings, calves, grip; dynamic core.
  squat: { ham: 2, calf: 1, grip: 1, glute: 1, quad: -1, back: -1, stab: 0, dyn: 2 },
};

if (typeof module !== 'undefined') {
  module.exports = { LIFTS, LIFT_NAMES, TM_INC, LOWER, SESSIONS, SESSION_ORDER, TEST_ORDER, SESSION_LABEL,
    WEEKS, EQUIPMENT, INJURIES, VARIANTS, EXERCISES, SLOT_NAMES, DAY_FIT };
}
