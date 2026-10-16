'use strict';
/*
 * 今日一句: motivating lines, gym memes and classic quotes. Shown on the home page, on rest days and after a
 * workout. Everything is switchable in 我的 → 外观与语录: turn off, pick categories, hide single lines, add your own.
 */

const QUOTE_CATS = { mot: '励志', fun: '搞怪', classic: '名人名言' };
const QUOTES = [
  // 励志
  ['m1', 'mot', '今天的酸痛，是明天的薄肌。'],
  ['m2', 'mot', '你不必很厉害才能开始，但你必须开始，才能很厉害。'],
  ['m3', 'mot', '比上周多一次，就是进步。'],
  ['m4', 'mot', '坚持不是每天都想练，而是不想练也去练。'],
  ['m5', 'mot', '最难的那一组，往往就是长肌肉的那一组。'],
  ['m6', 'mot', '别和别人比，和上个月的自己比。'],
  ['m7', 'mot', '慢慢来，比较快。'],
  ['m8', 'mot', '强壮不是一天练成的，但每一天都算数。'],
  ['m9', 'mot', '汗水不会说谎，杠铃也不会。'],
  ['m10', 'mot', '平台期不是终点，是下一次 PR 的起跑线。'],
  // 搞怪
  ['f1', 'fun', '薄肌理论：穿衣显瘦，脱衣有肉。'],
  ['f2', 'fun', '练腿日：今天谁也别想让我爬楼梯。'],
  ['f3', 'fun', '三分练，七分吃，剩下九十分靠睡。'],
  ['f4', 'fun', '碳水是快乐的源泉，蛋白质是肌肉的房租。'],
  ['f5', 'fun', '今天你练了吗？'],
  ['f6', 'fun', '不练腿，迟早变螳螂。'],
  ['f7', 'fun', '卧推是男人的浪漫，深蹲是腿的眼泪。'],
  ['f8', 'fun', '增肌期吃什么都香，减脂期看什么都饿。'],
  ['f9', 'fun', '健身房的镜子，是最好的美颜相机。'],
  ['f10', 'fun', '我不是在练，就是在去练的路上。'],
  ['f11', 'fun', '核心收紧！—— 全国健身教练统一口令'],
  ['f12', 'fun', 'PR 不发朋友圈，等于没破。'],
  ['f13', 'fun', '肌肉在长，体重在涨，裤子在叫。'],
  ['f14', 'fun', '有氧是不可能有氧的，这辈子都不可能有氧的。'],
  ['f15', 'fun', '别问，问就是在练。'],
  // 名人名言
  ['c1', 'classic', 'Light weight, baby!', 'Ronnie Coleman，八届奥林匹亚先生'],
  ['c2', 'classic', 'Everybody wants to be a bodybuilder, but nobody wants to lift no heavy-ass weights.', 'Ronnie Coleman'],
  ['c3', 'classic', 'The last three or four reps is what makes the muscle grow.', 'Arnold Schwarzenegger'],
  ['c4', 'classic', 'The iron never lies to you.', 'Henry Rollins'],
  ['c5', 'classic', 'Start too light, progress slowly.', 'Jim Wendler，5/3/1 作者'],
  ['c6', 'classic', '肌肉不会背叛你。', '动画《流汗吧！健身少女》'],
  ['c7', 'classic', '不积跬步，无以至千里。', '荀子《劝学》'],
  ['c8', 'classic', '千里之行，始于足下。', '《老子》'],
  ['c9', 'classic', '宝剑锋从磨砺出，梅花香自苦寒来。', '《警世贤文》'],
  ['c10', 'classic', 'Take care of your body. It\'s the only place you have to live.', 'Jim Rohn'],
  ['c11', 'classic', 'Start where you are. Use what you have. Do what you can.', 'Arthur Ashe'],
].map(([id, cat, t, by]) => ({ id, cat, t, by }));
const REST_LINES = ['肌肉是在休息的时候长出来的，今天好好睡。', '休息也是训练的一部分。', '今日任务：吃好、睡好、别熬夜。', '让肌肉喘口气，明天再战。'];
const DONE_LINES = ['泵感拉满，记得吃练后餐！', '又是被自己帅到的一天。', '练完了！碳水可以安排上了。', '今天的你，比昨天更硬核。', '收工！肌肉正在连夜施工。'];

const quoteCfg = () => ({ on: true, cats: Object.keys(QUOTE_CATS), hidden: [], custom: [], shift: 0, ...(state.quotes || {}) });
const quotesOn = () => quoteCfg().on;
function quotePool() {
  const c = quoteCfg();
  return QUOTES.filter((q) => c.cats.includes(q.cat)).concat(c.custom.map((q) => ({ ...q, cat: 'mine' })))
    .filter((q) => !c.hidden.includes(q.id));
}
/** Same line all day (changes at midnight); 换一句 moves along the pool. */
function quoteOfDay(date = new Date()) {
  const pool = quotePool();
  if (!pool.length) return null;
  const day = Math.floor(date.getTime() / 864e5 - date.getTimezoneOffset() / 1440);
  return pool[(((day * 7 + quoteCfg().shift) % pool.length) + pool.length) % pool.length];
}
const pickLine = (lines) => lines[Math.floor(Math.random() * lines.length)];
function doneLine() { return quotesOn() ? pickLine(DONE_LINES) : '训练完成！记得吃练后餐'; }

function quoteCardHtml() {
  if (!quotesOn()) return '';
  const q = quoteOfDay();
  if (!q) return '';
  return `<div class="card quote-card">
    <div class="row between"><span class="q-label">TODAY'S LINE · 今日一句</span>
      <span class="row q-acts"><button class="icon-round sm" data-q="next" aria-label="换一句">↻</button><button class="icon-round sm" data-q="hide" data-qid="${esc(q.id)}" aria-label="不再显示这句">✕</button></span></div>
    <p class="q-text">${esc(q.t)}</p>${q.by ? `<p class="q-by">—— ${esc(q.by)}</p>` : ''}</div>`;
}
function setQuotes(patch) { state.quotes = { ...quoteCfg(), ...patch }; save(); }

/* ---------- 我的 → 外观与语录 ---------- */
const ACCENTS = [['volt', '荧光绿', '#c8ff2e'], ['orange', '燃橙', '#ff6a2b'], ['cyan', '冰蓝', '#3ddcff'], ['pink', '霓虹粉', '#ff4f8b']];
function lookHtml() {
  const a = state.appearance || {};
  const c = quoteCfg();
  const hiddenN = c.hidden.length;
  return `<div class="card"><h2>外观</h2>
      <label>显示模式</label>
      <div class="chips">${[['dark', '暗色调'], ['light', '亮色调'], ['auto', '跟随系统']].map(([k, l]) => chip(l, `data-look-mode="${k}"`, (a.mode || 'dark') === k)).join('')}</div>
      <label>主题色</label>
      <div class="swatches">${ACCENTS.map(([k, l, hex]) => `<button class="swatch${(a.accent || 'volt') === k ? ' on' : ''}" data-look-accent="${k}" aria-label="${l}"><i style="background:${hex}"></i><span>${l}</span></button>`).join('')}</div></div>
    <div class="card"><h2>今日一句</h2>
      <label class="row check"><input type="checkbox" data-q-on ${c.on ? 'checked' : ''}> 显示语录（首页、休息日、训练完成）</label>
      ${c.on ? `<label>语录类型</label>
        <div class="chips">${Object.entries(QUOTE_CATS).map(([k, l]) => chip(l, `data-q-cat="${k}"`, c.cats.includes(k))).join('')}</div>
        <p class="muted">共 ${quotePool().length} 句可用${hiddenN ? ` · 已隐藏 ${hiddenN} 句 <button class="link" data-q="unhide">全部恢复</button>` : ''}</p>
        <label>添加自己的语录</label>
        <div class="row"><input id="qNew" class="grow" maxlength="60" placeholder="如：卧推 100 之前不谈恋爱"><button class="btn small" data-q="add">添加</button></div>
        ${c.custom.length ? `<div class="q-mine">${c.custom.map((q) => `<div class="row between"><span>${esc(q.t)}</span><button class="link" data-q="del" data-qid="${esc(q.id)}">删除</button></div>`).join('')}</div>` : ''}` : ''}</div>`;
}
function handleLookClick(b) {
  const ds = b.dataset;
  const c = quoteCfg();
  if (ds.lookMode) { state.appearance = { ...(state.appearance || {}), mode: ds.lookMode }; save(); applyTheme(); }
  else if (ds.lookAccent) { state.appearance = { ...(state.appearance || {}), accent: ds.lookAccent }; save(); applyTheme(); }
  else if (ds.qCat) {
    const cats = c.cats.includes(ds.qCat) ? c.cats.filter((x) => x !== ds.qCat) : c.cats.concat(ds.qCat);
    if (!cats.length && !c.custom.length) return toast('至少保留一种类型，或者直接关闭语录');
    setQuotes({ cats });
  } else if (ds.q === 'next') setQuotes({ shift: c.shift + 1 });
  else if (ds.q === 'hide') { setQuotes({ hidden: c.hidden.concat(ds.qid) }); toast('这句不会再出现，可在「我的 → 外观与语录」恢复'); }
  else if (ds.q === 'unhide') setQuotes({ hidden: [] });
  else if (ds.q === 'add') {
    const t = ($('#qNew').value || '').trim();
    if (!t) return toast('写一句吧');
    setQuotes({ custom: c.custom.concat({ id: `u${Date.now().toString(36)}`, t: t.slice(0, 60) }) });
    toast('已添加');
  } else if (ds.q === 'del') setQuotes({ custom: c.custom.filter((q) => q.id !== ds.qid) });
  else return false;
  render();
  return true;
}
function bindQuotes() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#view-home [data-q], #view-me [data-q], #view-me [data-look-mode], #view-me [data-look-accent], #view-me [data-q-cat]');
    if (b) handleLookClick(b);
  });
  document.addEventListener('change', (e) => {
    if (e.target.dataset && e.target.dataset.qOn !== undefined) { setQuotes({ on: e.target.checked }); render(); }
  });
}
