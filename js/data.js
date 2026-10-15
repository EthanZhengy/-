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
  // Mike 卧推增力计划
  mike1: { main: 'bench', program: 'mike' },
  mike2: { main: 'bench', program: 'mike' },
  mikeTest: { main: 'bench', program: 'mike' },
};
const SESSION_ORDER = ['press', 'deadlift', 'bench', 'squat'];
const TEST_ORDER = ['deadlift', 'bench', 'squat', 'press']; // week 12; press test is optional
const SESSION_LABEL = { press: '推举日', deadlift: '硬拉日', bench: '卧推日', squat: '深蹲日', mike1: '第一推（胸）', mike2: '第二推（手臂）', mikeTest: '卧推极限测试' };

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

/* ---------- Training programs ---------- */
const PROGRAMS = {
  '531': {
    id: '531', name: '5/3/1 三个月力量挑战', short: '5/3/1', weeks: 12, days: 4,
    desc: '推举、硬拉、卧推、深蹲四个主项，一周四练，12 周周期，第 12 周测极限。适合全面提升力量举三项。',
    defaultSchedule: [0, 1, 3, 4],
  },
  mike: {
    id: 'mike', name: 'Mike 卧推增力计划', short: '卧推增力', weeks: 16, days: 2,
    desc: '专攻卧推的 16 周计划：一周两推，4 周容量储备 → 11 周力量储备 → 第 16 周测极限。其他部位照常训练。',
    defaultSchedule: [0, 3],
  },
};

/*
 * Mike 卧推增力计划 (16 weeks), transcribed from the plan spreadsheets.
 * b: Day1 bench [sets, reps, % of bench 1RM, RPE]. cg: Day2 close-grip % of close-grip 1RM (+ RPE).
 * Phase 1 Day2 does 2×8 at cg% then 2×8 at −10%. Phase 2 Day2 mirrors Day1 sets / reps.
 * pause: seconds for the pause-bench option (1s → 6 reps, 2s → 4 reps, 3s → 2 reps).
 */
const MIKE_WEEKS = [
  { phase: 1, b: [4, 8, 65, '7–8'], cg: [65, '6'] },
  { phase: 1, b: [4, 7, 68, '7–8'], cg: [70, '7'] },
  { phase: 1, b: [4, 6, 72, '7.5–8.5'], cg: [72.5, '8'] },
  { phase: 1, b: [4, 6, 77, '8.5–9.5'], cg: [75, '9'] },
  { phase: 2, b: [3, 5, 70, '5.5'], cg: [70, '5.5'], pause: 1 },
  { phase: 2, b: [3, 5, 75, '6.5'], cg: [75, '6.5'], pause: 1 },
  { phase: 2, b: [3, 5, 80, '7.5'], cg: [80, '7.5'], pause: 1 },
  { phase: 2, b: [3, 4, 85, '8.5'], cg: [85, '8.5'], pause: 1 },
  { phase: 2, b: [3, 3, 88, '9'], cg: [88, '9'], pause: 2 },
  { phase: 2, b: [2, 5, 77, '6'], cg: [77, '6'], pause: 2 },
  { phase: 2, b: [2, 5, 82, '8'], cg: [82, '8'], pause: 2 },
  { phase: 2, b: [2, 3, 88, '7.5'], cg: [88, '7.5'], pause: 2 },
  { phase: 2, b: [2, 2, 90, '8.5'], cg: [90, '8.5'], pause: 3 },
  { phase: 2, b: [3, 1, 95, '9'], cg: [95, '9'], pause: 3 },
  { phase: 2, b: [5, 5, 70, '7'], cg: [60, '7'], pause: 3, taper: true },
  { phase: 3, test: true },
].map((w, i) => ({
  ...w,
  name: w.test ? '极限测试周' : w.phase === 1 ? `容量储备期 · 第 ${i + 1} 周` : `力量储备期 · 第 ${i - 3} 周${w.taper ? '（测试前减量）' : ''}`,
}));
const MIKE_WARMUP = '热身：胸椎灵活性 + 泡沫轴放松紧张肌肉 + 单臂哑铃支撑 + 2 组高次数小重量高位下拉 / 引体';

/* 力量储备期 Day1「五选一」: pick the one that targets your weak point; 3×6 at 80% of the day's bench weight. */
const MIKE_VARIANTS = {
  spoto: { name: 'Spoto 卧推', weak: '底部发力弱', cue: '杠铃下放到离胸口 2–3 厘米处停住、不触胸，保持全身紧张再推起。' },
  pause: { name: '暂停卧推', weak: '离胸启动慢', cue: '杠铃触胸后完全静止，按计划暂停 1–3 秒再推起，消除反弹。' },
  band: { name: '弹力带卧推', weak: '锁定无力', cue: '杠铃两端挂弹力带，越往上阻力越大，练到完全锁定。' },
  high: { name: '高位卧推', weak: '上半程 / 锁定无力', cue: '只做上半程（用保护杆或垫板限制下放深度），强化锁定段。' },
  cg: { name: '窄推', weak: '三头弱、锁定不足', cue: '握距约与肩同宽，肘部贴近身体，三头发力推到锁定。' },
};

/* Equipment tokens. A requirement "a|b" means either one is enough. */
const EQUIPMENT = {
  barbell: '杠铃 + 杠铃片', rack: '深蹲架', bench: '卧推凳', dumbbell: '哑铃', pullup: '单杠 / 引体架',
  dip: '双杠', cable: '龙门架 / 绳索', machine: '固定器械（腿弯举、腿屈伸、器械划船等）',
  band: '弹力带', trapbar: '六角杠铃', ssb: '安全深蹲杠', legpress: '腿举机', kettlebell: '壶铃',
};
const INJURIES = { shoulder: '肩', lowerBack: '腰 / 下背', knee: '膝', elbow: '肘', wrist: '手腕' };

/**
 * Main-lift variants. inc = loading increment ('bar' uses the user's plate increment).
 * fix: injuries this variant is the preferred substitute for. avoid: injuries it aggravates.
 */
const VARIANTS = {
  press: [
    { id: 'ohp', cue: '站姿，杠铃贴锁骨，收紧臀腹，垂直推过头顶，头从两臂间穿过，锁定后再下放。', name: '杠铃站姿推举', eq: ['barbell', 'rack'], inc: 'bar', avoid: ['shoulder', 'lowerBack', 'wrist', 'elbow'] },
    { id: 'seated_ohp', cue: '坐姿靠背，背部贴紧，杠铃从锁骨推到头顶，避免腰部过度反弓。', name: '坐姿杠铃推举', eq: ['barbell', 'rack', 'bench'], inc: 'bar', fix: ['lowerBack'], avoid: ['shoulder', 'elbow'] },
    { id: 'landmine', cue: '杠铃一端固定，单手握另一端于肩前，斜向上推出，对肩关节更友好。', name: '单臂地雷推举', eq: ['barbell'], inc: 'bar', fix: ['shoulder', 'elbow'], avoid: [] },
    { id: 'db_ohp', cue: '坐姿靠背，哑铃于耳侧，掌心向前或相对，推到头顶不撞击，控制下放。', name: '坐姿哑铃推举（单只重量）', eq: ['dumbbell', 'bench'], inc: 2, fix: ['wrist', 'lowerBack'], avoid: ['shoulder'] },
  ],
  bench: [
    { id: 'bb_bench', cue: '肩胛后缩下沉，双脚踩实，杠铃下放到胸骨下缘，小臂垂直，推起时向脸部方向微弧线。', name: '杠铃卧推', eq: ['barbell', 'bench'], inc: 'bar', avoid: ['shoulder', 'wrist', 'elbow'] },
    { id: 'db_bench', cue: '肩胛收紧，哑铃下放到胸侧，肘约 45°，推起时两铃略靠拢，不要互撞。', name: '哑铃卧推（单只重量）', eq: ['dumbbell', 'bench'], inc: 2, fix: ['shoulder', 'wrist', 'elbow'], avoid: [] },
    { id: 'floor_press', cue: '躺在地上做卧推，上臂触地即停，减少肩部活动范围，适合肩不适。', name: '杠铃地板卧推', eq: ['barbell'], inc: 'bar', fix: ['shoulder'], avoid: ['wrist'] },
  ],
  squat: [
    { id: 'bb_squat', cue: '杠铃放斜方肌上，吸气撑腹，髋膝同时屈，膝盖对准脚尖，蹲至大腿平行或更低。', name: '杠铃深蹲', eq: ['barbell', 'rack'], inc: 'bar', avoid: ['shoulder', 'lowerBack', 'knee', 'wrist', 'elbow'] },
    { id: 'ssb_squat', cue: '安全杠手柄在前，不需要肩外旋，躯干更直立，对肩、肘、腕友好。', name: '安全杠深蹲', eq: ['ssb', 'rack'], inc: 'bar', fix: ['shoulder', 'wrist', 'elbow'], avoid: ['knee'] },
    { id: 'box_squat', cue: '向后坐到箱子上停顿 1 秒，保持张力再站起，膝盖前移少，适合膝不适。', name: '箱式深蹲', eq: ['barbell', 'rack', 'bench'], inc: 'bar', fix: ['knee'], avoid: ['shoulder', 'wrist'] },
    { id: 'front_squat', cue: '杠铃架在三角肌前束，肘抬高，躯干直立下蹲，股四头参与更多，腰部压力小。', name: '杠铃前蹲', eq: ['barbell', 'rack'], inc: 'bar', fix: [], avoid: ['knee', 'wrist'] },
    { id: 'leg_press', cue: '背部和臀部贴紧靠垫，脚与肩同宽，下放到膝约 90°，不要锁死膝盖。', name: '腿举', eq: ['legpress'], inc: 5, fix: ['lowerBack'], avoid: [] },
    { id: 'goblet', cue: '双手捧哑铃于胸前，肘在两膝内侧，躯干直立下蹲，适合家庭训练。', name: '高脚杯深蹲（哑铃）', eq: ['dumbbell'], inc: 2, fix: ['lowerBack', 'shoulder', 'wrist'], avoid: ['knee'] },
  ],
  deadlift: [
    { id: 'conv_dl', cue: '杠铃在脚中线上方，髋高于膝、肩在杠前，吸气撑腹，腿推地起杠，杠贴腿上升。', name: '传统硬拉', eq: ['barbell'], inc: 'bar', avoid: ['lowerBack'] },
    { id: 'trap_dl', cue: '站在六角杠中间，握中立手柄，像深蹲一样推地站起，腰部剪切力小。', name: '六角杠铃硬拉', eq: ['trapbar'], inc: 'bar', fix: ['lowerBack'], avoid: [] },
    { id: 'sumo_dl', cue: '宽站距脚尖外展，手在两腿间握杠，躯干更直立，膝盖向外打开。', name: '相扑硬拉', eq: ['barbell'], inc: 'bar', fix: [], avoid: ['knee'] },
    { id: 'rack_pull', cue: '杠铃放在膝下高度的保护杆上拉起，缩短行程，降低腰部负担。', name: '架上拉（膝下高度）', eq: ['barbell', 'rack'], inc: 'bar', fix: ['lowerBack', 'knee'], avoid: [] },
    { id: 'db_rdl', cue: '双手持哑铃，微屈膝，髋向后推，哑铃贴腿下放到小腿中部，臀部发力站起。', name: '哑铃罗马尼亚硬拉（单只重量）', eq: ['dumbbell'], inc: 2, fix: ['lowerBack'], avoid: [] },
  ],
};

/**
 * Accessory library. slot: pull / core / upper (press & bench days) / lower (deadlift & squat days).
 * m: muscle group, used for balancing and for day-specific preferences.
 * back: loads the lower back (avoided when the back is already fatigued or the next day is a lower-body day).
 */
const EXERCISES = [
  // 拉类
  { id: 'pullup', cue: '握距略宽于肩，先沉肩，再把胸口拉向杠，下放到手臂接近伸直。', name: '引体向上', slot: 'pull', m: 'vert', eq: ['pullup'], reps: '6-12' },
  { id: 'lat_pd', cue: '挺胸微后仰，沉肩后把杠拉到锁骨，肘部向下向后，控制回放。', name: '高位下拉', slot: 'pull', m: 'vert', eq: ['cable'], reps: '10-15' },
  { id: 'band_pd', cue: '弹力带固定在高处，跪姿或坐姿向下拉，感受背阔发力。', name: '弹力带下拉', slot: 'pull', m: 'vert', eq: ['band'], reps: '12-15' },
  { id: 'db_row', cue: '一手一膝撑凳，背平直，哑铃拉向髋部，肘贴身体，顶峰停顿。', name: '单臂哑铃划船', slot: 'pull', m: 'horiz', eq: ['dumbbell', 'bench'], reps: '10-12/侧' },
  { id: 'bb_row', cue: '俯身约 45°，背部平直，杠铃拉向肚脐，避免借力甩动。', name: '杠铃划船', slot: 'pull', m: 'horiz', eq: ['barbell'], back: true, avoid: ['lowerBack'], reps: '8-12' },
  { id: 'tbar_row', cue: '俯身握 T 杠手柄，背平直，拉向胸下方，挤压肩胛。', name: 'T 杠划船', slot: 'pull', m: 'horiz', eq: ['barbell'], back: true, avoid: ['lowerBack'], reps: '10-12' },
  { id: 'chest_row', cue: '胸贴上斜凳，消除腰部负担，哑铃拉向髋部两侧。', name: '胸部支撑划船', slot: 'pull', m: 'horiz', eq: ['dumbbell', 'bench'], reps: '10-15' },
  { id: 'cable_row', cue: '坐姿挺胸，手柄拉向腹部，肩胛后缩，躯干不要前后晃。', name: '坐姿绳索划船', slot: 'pull', m: 'horiz', eq: ['cable'], reps: '10-15' },
  { id: 'machine_row', cue: '胸贴靠垫，拉到肩胛完全后缩，控制回放。', name: '坐姿器械划船', slot: 'pull', m: 'horiz', eq: ['machine'], reps: '10-15' },
  { id: 'inverted_row', cue: '杠铃放在架上，身体在杠下成直线，把胸拉向杠。脚越靠前越难。', name: '反向划船（杠铃架）', slot: 'pull', m: 'horiz', eq: ['rack', 'barbell'], reps: '10-15' },
  { id: 'band_row', cue: '弹力带固定在胸前高度，向后拉，挤压肩胛。', name: '弹力带划船', slot: 'pull', m: 'horiz', eq: ['band'], reps: '15' },

  // 腹肌核心: stab = anti-movement (spine-friendly, good after heavy deadlifts), dyn = dynamic
  { id: 'ab_wheel', cue: '跪姿，收紧腹部和臀部，缓慢推出到能控制的最远处，腰不塌。', name: '健腹轮', slot: 'core', m: 'dyn', eq: [], avoid: ['lowerBack'], reps: '8-15' },
  { id: 'hanging_lr', cue: '悬挂在单杠上，卷起骨盆抬腿，避免身体摆动。', name: '悬垂举腿', slot: 'core', m: 'dyn', eq: ['pullup'], avoid: ['shoulder'], reps: '10-15' },
  { id: 'db_sidebend', cue: '单手持哑铃，躯干向持铃侧弯曲再用对侧腹斜肌拉回。', name: '哑铃侧弯', slot: 'core', m: 'dyn', eq: ['dumbbell'], reps: '12-20/侧' },
  { id: 'weighted_situp', cue: '胸前抱杠铃片，卷腹坐起，下放时控制速度。', name: '负重仰卧起坐', slot: 'core', m: 'dyn', eq: [], avoid: ['lowerBack'], reps: '15-30' },
  { id: 'cable_crunch', cue: '跪在龙门架前，绳索握在头侧，卷腹向下，髋部不动。', name: '绳索卷腹', slot: 'core', m: 'dyn', eq: ['cable'], reps: '12-20' },
  { id: 'plank', cue: '前臂撑地，头到脚跟成一条直线，收紧腹部和臀部。', name: '平板支撑', slot: 'core', m: 'stab', eq: [], avoid: ['shoulder'], reps: '30-60 秒' },
  { id: 'side_plank', cue: '侧卧前臂撑地，身体成直线，髋部抬高不下沉。', name: '侧平板支撑', slot: 'core', m: 'stab', eq: [], avoid: ['shoulder'], reps: '30-45 秒/侧' },
  { id: 'dead_bug', cue: '仰卧，下背贴地，对侧手脚同时缓慢伸出再收回，全程腰不离地。', name: '死虫式', slot: 'core', m: 'stab', eq: [], reps: '10-12/侧' },
  { id: 'pallof', cue: '侧对绳索或弹力带，双手在胸前握住，向前推直并抵抗旋转。', name: '抗旋转推（Pallof）', slot: 'core', m: 'stab', eq: ['cable|band'], reps: '10-12/侧' },

  // 推举 / 卧推日辅助
  { id: 'tri_pushdown', cue: '上臂贴身体固定，只动小臂向下压到伸直，顶峰挤压三头。', name: '肱三头肌下压', slot: 'upper', m: 'tri', eq: ['cable|band'], reps: '12-20' },
  { id: 'oh_ext', cue: '背对绳索或双手持哑铃过头，上臂不动，小臂向上伸直。', name: '肱三头肌过头屈伸', slot: 'upper', m: 'tri', eq: ['cable|dumbbell'], avoid: ['elbow', 'shoulder'], reps: '12-15' },
  { id: 'skull', cue: '仰卧，哑铃从额头上方屈肘下放到头侧，上臂保持不动。', name: '仰卧臂屈伸', slot: 'upper', m: 'tri', eq: ['dumbbell', 'bench'], avoid: ['elbow'], reps: '10-15' },
  { id: 'dips', cue: '双杠支撑，身体略前倾，下放到上臂约与地面平行，推起。', name: '双杠臂屈伸', slot: 'upper', m: 'tri', eq: ['dip'], avoid: ['shoulder', 'elbow'], reps: '8-15' },
  { id: 'cg_pushup', cue: '双手比肩略窄，肘贴身体下放，三头发力推起。', name: '窄距俯卧撑', slot: 'upper', m: 'tri', eq: [], avoid: ['wrist'], reps: '10-20' },
  { id: 'db_curl', cue: '上臂贴身体，掌心向上弯举，下放到底，不借力甩。', name: '哑铃弯举', slot: 'upper', m: 'bi', eq: ['dumbbell'], reps: '10-15' },
  { id: 'hammer', cue: '掌心相对弯举，练肱桡肌和肱肌，对肘部更友好。', name: '锤式弯举', slot: 'upper', m: 'bi', eq: ['dumbbell'], reps: '10-15' },
  { id: 'bb_curl', cue: '双手与肩同宽握杠，上臂固定弯举，避免身体后仰。', name: '杠铃弯举', slot: 'upper', m: 'bi', eq: ['barbell'], avoid: ['wrist', 'elbow'], reps: '10-12' },
  { id: 'cable_curl', cue: '绳索或弹力带提供持续张力，上臂固定弯举。', name: '绳索弯举', slot: 'upper', m: 'bi', eq: ['cable|band'], reps: '12-15' },
  { id: 'face_pull', cue: '绳索拉向额头，肘部高抬向两侧，最后外旋，练后束和肩袖。', name: '面拉', slot: 'upper', m: 'rear', eq: ['cable|band'], reps: '15-20' },
  { id: 'rear_fly', cue: '俯身，背平直，哑铃向两侧打开，用后束发力，不耸肩。', name: '哑铃俯身侧平举', slot: 'upper', m: 'rear', eq: ['dumbbell'], reps: '15-20' },
  { id: 'band_pa', cue: '双手握弹力带于胸前，向两侧拉开到胸口，挤压肩胛。', name: '弹力带拉开', slot: 'upper', m: 'rear', eq: ['band'], reps: '20-30' },
  { id: 'lat_raise', cue: '微屈肘，哑铃向两侧抬到与肩同高，小指略高，控制下放。', name: '哑铃侧平举', slot: 'upper', m: 'side', eq: ['dumbbell'], avoid: ['shoulder'], reps: '12-20' },
  { id: 'cable_lat', cue: '单手握低位绳索，向侧面抬起，下放全程有张力。', name: '绳索侧平举', slot: 'upper', m: 'side', eq: ['cable'], reps: '12-20/侧' },

  // 硬拉 / 深蹲日辅助
  { id: 'lunge', cue: '向前迈步下蹲，后膝接近地面，前脚发力站起，躯干直立。', name: '箭步蹲', slot: 'lower', m: 'quad', eq: ['dumbbell'], avoid: ['knee'], reps: '10-12/腿' },
  { id: 'bss', cue: '后脚放凳上，前脚下蹲，膝盖对准脚尖，前腿发力站起。', name: '单腿深蹲（保加利亚分腿蹲）', slot: 'lower', m: 'quad', eq: ['dumbbell', 'bench'], avoid: ['knee'], reps: '8-12/腿' },
  { id: 'leg_ext', cue: '坐姿，脚踝勾住滚垫，伸膝到底顶峰停顿，控制下放。', name: '腿屈伸', slot: 'lower', m: 'quad', eq: ['machine'], reps: '12-20' },
  { id: 'leg_curl', cue: '俯卧或坐姿，脚跟向臀部弯曲，髋部不要抬起。', name: '腿弯举', slot: 'lower', m: 'ham', eq: ['machine'], reps: '10-15' },
  { id: 'db_rdl_acc', cue: '微屈膝，髋向后推，哑铃贴腿下放，感受腘绳拉伸后站起。', name: '哑铃罗马尼亚硬拉', slot: 'lower', m: 'ham', eq: ['dumbbell'], back: true, reps: '10-12' },
  { id: 'back_ext', cue: '髋部抵住靠垫，背部平直下放，用臀和腘绳把身体抬回成直线。', name: '山羊挺身', slot: 'lower', m: 'back', eq: ['machine'], back: true, reps: '12-15' },
  { id: 'good_morning', cue: '杠铃在背上，微屈膝，髋向后推上身前倾到约平行，再起身。', name: '早安式', slot: 'lower', m: 'ham', eq: ['barbell', 'rack'], back: true, avoid: ['lowerBack'], reps: '8-12' },
  { id: 'pull_through', cue: '背对绳索，绳在两腿间，髋向后推再向前顶，用臀部发力。', name: '绳索髋屈伸', slot: 'lower', m: 'glute', eq: ['cable|band'], reps: '12-15' },
  { id: 'hip_thrust', cue: '上背靠凳，杠铃在髋部，脚踩地，臀部发力向上顶到身体成直线。', name: '臀推', slot: 'lower', m: 'glute', eq: ['barbell', 'bench'], reps: '10-12' },
  { id: 'glute_bridge', cue: '仰卧单腿屈膝，另一腿伸直，臀部发力抬髋，顶峰停顿。', name: '单腿臀桥', slot: 'lower', m: 'glute', eq: [], reps: '12-15/腿' },
  { id: 'calf', cue: '前脚掌站在台阶边缘，脚跟下放到底再踮到最高，顶峰停 1 秒。', name: '提踵', slot: 'lower', m: 'calf', eq: [], reps: '15-20' },
  { id: 'farmer', cue: '双手提重哑铃，挺胸收腹，小步快走，练握力和核心。', name: '握力练习（农夫行走）', slot: 'lower', m: 'grip', eq: ['dumbbell'], reps: '30-40 米' },
  { id: 'dead_hang', cue: '双手握单杠悬挂，肩部轻微下沉，坚持到握不住为止。', name: '握力练习（单杠悬挂）', slot: 'lower', m: 'grip', eq: ['pullup'], avoid: ['shoulder'], reps: '30-60 秒' },
];

/* Photos (assets/ex/<id>_0.webp = start, _1.webp = finish) from the public-domain free-exercise-db. */
const EX_IMG = {
  ohp: 'Standing_Military_Press', seated_ohp: 'Seated_Barbell_Military_Press', db_ohp: 'Seated_Dumbbell_Press',
  bb_bench: 'Barbell_Bench_Press_-_Medium_Grip', db_bench: 'Dumbbell_Bench_Press', floor_press: 'Floor_Press',
  bb_squat: 'Barbell_Full_Squat', box_squat: 'Box_Squat', front_squat: 'Front_Squat_Clean_Grip', leg_press: 'Leg_Press',
  goblet: 'Goblet_Squat', conv_dl: 'Barbell_Deadlift', trap_dl: 'Trap_Bar_Deadlift', sumo_dl: 'Sumo_Deadlift',
  rack_pull: 'Rack_Pulls', db_rdl: 'Stiff-Legged_Dumbbell_Deadlift', pullup: 'Pullups', lat_pd: 'Wide-Grip_Lat_Pulldown',
  db_row: 'One-Arm_Dumbbell_Row', bb_row: 'Bent_Over_Barbell_Row', tbar_row: 'T-Bar_Row_with_Handle',
  chest_row: 'Dumbbell_Incline_Row', cable_row: 'Seated_Cable_Rows', machine_row: 'Leverage_Iso_Row', inverted_row: 'Inverted_Row',
  ab_wheel: 'Ab_Roller', hanging_lr: 'Hanging_Leg_Raise', db_sidebend: 'Dumbbell_Side_Bend', weighted_situp: 'Sit-Up',
  cable_crunch: 'Cable_Crunch', plank: 'Plank', side_plank: 'Side_Bridge', dead_bug: 'Dead_Bug', pallof: 'Pallof_Press',
  tri_pushdown: 'Triceps_Pushdown', oh_ext: 'Cable_Rope_Overhead_Triceps_Extension', skull: 'Lying_Triceps_Press',
  dips: 'Dips_-_Triceps_Version', cg_pushup: 'Push-Ups_-_Close_Triceps_Position', db_curl: 'Dumbbell_Bicep_Curl',
  hammer: 'Hammer_Curls', bb_curl: 'Barbell_Curl', cable_curl: 'Standing_Biceps_Cable_Curl', face_pull: 'Face_Pull',
  rear_fly: 'Seated_Bent-Over_Rear_Delt_Raise', band_pa: 'Band_Pull_Apart', lat_raise: 'Side_Lateral_Raise',
  lunge: 'Dumbbell_Lunges', bss: 'Split_Squat_with_Dumbbells', leg_ext: 'Leg_Extensions', leg_curl: 'Lying_Leg_Curls',
  db_rdl_acc: 'Stiff-Legged_Dumbbell_Deadlift', back_ext: 'Hyperextensions_Back_Extensions', good_morning: 'Good_Morning',
  pull_through: 'Pull_Through', hip_thrust: 'Barbell_Hip_Thrust', glute_bridge: 'Single_Leg_Glute_Bridge',
  calf: 'Standing_Calf_Raises', farmer: 'Farmers_Walk',
};
Object.values(VARIANTS).flat().concat(EXERCISES).forEach((e) => { if (EX_IMG[e.id]) e.img = EX_IMG[e.id]; });
function exImgUrl(img, i = 0) { return `assets/ex/${img}_${i}.webp`; }

/* Exercise-library categories (left sidebar) and equipment filter (top chips). */
const LIB_CATS = [['main', '主项'], ['chest', '胸'], ['back', '背'], ['leg', '腿'], ['shoulder', '肩'], ['bi', '二头'],
  ['tri', '三头'], ['glute', '臀部'], ['calf', '小腿'], ['grip', '前臂握力'], ['core', '核心'], ['oly', '奥举'],
  ['power', '爆发'], ['stretch', '拉伸'], ['custom', '自定义']];
const MUSCLE_CAT = { vert: 'back', horiz: 'back', back: 'back', tri: 'tri', bi: 'bi', rear: 'shoulder', side: 'shoulder',
  quad: 'leg', ham: 'leg', glute: 'glute', calf: 'calf', grip: 'grip', stab: 'core', dyn: 'core', custom: 'custom' };
const LIFT_CAT = { press: 'shoulder', bench: 'chest', squat: 'leg', deadlift: 'back' };
const EQ_FILTERS = [['all', '全部'], ['barbell', '杠铃'], ['dumbbell', '哑铃'], ['cable', '绳索'], ['machine', '器械'], ['body', '自重'], ['band', '弹力带'], ['kettlebell', '壶铃'], ['other', '其他']];
function primaryEq(eq) {
  const toks = (eq || []).flatMap((t) => t.split('|'));
  if (toks.some((t) => ['barbell', 'trapbar', 'ssb'].includes(t))) return 'barbell';
  if (toks.includes('dumbbell')) return 'dumbbell';
  if (toks.includes('cable')) return 'cable';
  if (toks.some((t) => ['machine', 'legpress'].includes(t))) return 'machine';
  if (toks.includes('band')) return 'band';
  if (toks.includes('kettlebell')) return 'kettlebell';
  return 'body';
}

/* Common foods for one-tap logging: protein / carbs / fat in grams per serving. */
const FOODS = [
  { name: '鸡蛋 1 个', p: 6, c: 0.5, f: 5 }, { name: '鸡胸肉 100g', p: 23, c: 0, f: 2 }, { name: '瘦牛肉 100g', p: 21, c: 0, f: 6 },
  { name: '三文鱼 100g', p: 20, c: 0, f: 13 }, { name: '虾仁 100g', p: 19, c: 1, f: 1 }, { name: '豆腐 100g', p: 8, c: 2, f: 4 },
  { name: '蛋白粉 1 勺', p: 24, c: 3, f: 1.5 }, { name: '牛奶 250ml', p: 8, c: 12, f: 9 }, { name: '希腊酸奶 150g', p: 15, c: 6, f: 1 },
  { name: '米饭 1 碗(200g)', p: 5, c: 56, f: 0.6 }, { name: '面条 1 碗(200g熟)', p: 8, c: 50, f: 1.5 }, { name: '燕麦 50g', p: 6.5, c: 33, f: 3.5 },
  { name: '全麦面包 2 片', p: 8, c: 24, f: 2 }, { name: '红薯 200g', p: 3, c: 40, f: 0.2 }, { name: '土豆 200g', p: 4, c: 34, f: 0.2 },
  { name: '香蕉 1 根', p: 1, c: 27, f: 0.3 }, { name: '苹果 1 个', p: 0.5, c: 25, f: 0.3 }, { name: '坚果 30g', p: 6, c: 6, f: 15 },
  { name: '牛油果 半个', p: 1.5, c: 6, f: 11 }, { name: '橄榄油 1 勺', p: 0, c: 0, f: 10 }, { name: '蔬菜 200g', p: 3, c: 8, f: 0.5 },
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
    WEEKS, EQUIPMENT, INJURIES, VARIANTS, EXERCISES, SLOT_NAMES, DAY_FIT, LIB_CATS, MUSCLE_CAT, LIFT_CAT, EQ_FILTERS, primaryEq, EX_IMG, exImgUrl, FOODS, PROGRAMS, MIKE_WEEKS, MIKE_WARMUP, MIKE_VARIANTS };
}
