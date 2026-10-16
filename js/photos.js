'use strict';
/*
 * 照片墙 (历史 → 照片墙): private progress photos, grouped by month, with a side-by-side compare.
 * Photos live in the private progress-photos bucket and are shown through signed links (supabase/progress_photos.sql).
 */

const PW_BUCKET = 'progress-photos';
const POSES = [['front', '正面'], ['side', '侧面'], ['back', '背面'], ['other', '其他']];
const POSE_NAME = Object.fromEntries(POSES);
let pw = { list: null, urls: {}, pose: 'all', compare: false, pick: [], loading: false, err: '', draft: null };

async function loadPhotos(force = false) {
  if (!cloud.user || pw.loading || (pw.list && !force)) return;
  pw.loading = true;
  const { data, error } = await cloud.client.from('progress_photos').select('*')
    .order('taken_on', { ascending: false }).order('created_at', { ascending: false }).limit(500);
  pw.loading = false;
  if (error) { pw.err = isMissingTable(error) ? 'need-sql' : error.message || String(error); pw.list = []; }
  else { pw.err = ''; pw.list = data || []; await signPhotos(pw.list.map((p) => p.path)); }
  if (currentView === 'history' && histTab === 'photos') render();
}
async function signPhotos(paths) {
  const need = paths.filter((p) => !pw.urls[p]);
  if (!need.length) return;
  const { data } = await cloud.client.storage.from(PW_BUCKET).createSignedUrls(need, 6 * 3600);
  (data || []).forEach((d) => { if (d.signedUrl) pw.urls[d.path] = d.signedUrl; });
}
const pwById = (id) => (pw.list || []).find((p) => p.id === id);
const pwLabel = (p) => `${fmtDate(parseKey(p.taken_on))}${p.weight ? ` · ${Number(p.weight)}kg` : ''}`;

function photoWallHtml() {
  if (!cloudEnabled()) return '<div class="card"><h2>照片墙</h2><p class="muted">照片墙需要开启云端账号。</p></div>';
  if (!cloud.user) {
    return `<div class="card"><h2>📸 身材照片墙</h2><p class="muted">定期拍一张，按时间排成照片墙，还能左右对比看变化。照片私密保存在你的账号里，只有你自己能看到。</p>
      <button class="btn block" data-pw="login">登录后使用</button></div>`;
  }
  if (pw.uid !== cloud.user.id) pw = { ...pw, uid: cloud.user.id, list: null, urls: {}, pick: [], compare: false, err: '' }; // another account signed in
  if (!pw.list) { loadPhotos(); return '<div class="card"><p class="muted center">照片加载中…</p></div>'; }
  if (pw.err === 'need-sql') return '<div class="card"><h2>照片墙还没开启</h2><p class="muted">请在 Supabase → SQL Editor 运行 <code>supabase/progress_photos.sql</code>。</p></div>';
  const list = pw.list.filter((p) => pw.pose === 'all' || p.pose === pw.pose);
  let html = `<div class="card"><div class="row between"><h2>📸 身材照片墙</h2><span class="muted small">🔒 仅自己可见</span></div>
    <div class="row pw-actions"><label class="btn grow">＋ 添加照片<input type="file" id="pwFile" accept="image/*" hidden></label>
      ${pw.list.length > 1 ? `<button class="btn ${pw.compare ? '' : 'ghost'}" data-pw="compare">${pw.compare ? '取消对比' : '对比'}</button>` : ''}</div>
    ${pw.compare ? `<p class="pw-hint">选两张照片对比（已选 ${pw.pick.length}/2）</p>` : ''}
    ${pw.list.length ? `<div class="chips">${[['all', '全部'], ...POSES].map(([k, l]) => chip(l, `data-pwpose="${k}"`, pw.pose === k)).join('')}</div>` : ''}
    ${pw.err ? `<p class="warn">加载失败：${esc(pw.err)}</p>` : ''}
    ${pwTrendHtml()}</div>`;
  if (!pw.list.length) return `${html}<p class="muted center pad">还没有照片。建议每 2–4 周同一时间、同一光线、同一姿势拍一张，变化最明显。</p>`;
  if (!list.length) return `${html}<p class="muted center pad">这个姿势还没有照片</p>`;
  const months = {};
  list.forEach((p) => (months[p.taken_on.slice(0, 7)] = months[p.taken_on.slice(0, 7)] || []).push(p));
  html += Object.keys(months).sort().reverse().map((m) => `<h3 class="pw-month">${Number(m.slice(0, 4))}年${Number(m.slice(5))}月 <span class="muted">${months[m].length} 张</span></h3>
    <div class="pw-grid">${months[m].map((p) => {
      const sel = pw.pick.indexOf(p.id);
      return `<button class="pw-tile${sel >= 0 ? ' sel' : ''}" data-pwid="${p.id}">${pw.urls[p.path] ? `<img src="${esc(pw.urls[p.path])}" alt="" loading="lazy">` : ''}
        <span class="pw-cap">${fmtDate(parseKey(p.taken_on))}${p.weight ? `<br>${Number(p.weight)}kg` : ''}</span>${sel >= 0 ? `<i class="pw-num">${sel + 1}</i>` : ''}</button>`;
    }).join('')}</div>`).join('');
  return html;
}
/** First vs latest photo that has a weight. */
function pwTrendHtml() {
  const w = (pw.list || []).filter((p) => p.weight);
  if (w.length < 2) return '';
  const a = w[w.length - 1], b = w[0];
  const d = Number(b.weight) - Number(a.weight);
  return `<p class="muted small">${fmtDate(parseKey(a.taken_on))} → ${fmtDate(parseKey(b.taken_on))}：体重 ${d >= 0 ? '+' : ''}${d.toFixed(1)}kg · 共 ${pw.list.length} 张</p>`;
}

/* ---------- add ---------- */
async function openPhotoDraft(file) {
  try {
    const blob = await compressImage(file, 1440, 0.85);
    if (pw.draft && pw.draft.url) URL.revokeObjectURL(pw.draft.url);
    const today = dateKey(new Date());
    pw.draft = { blob, url: URL.createObjectURL(blob), pose: 'front', date: today, weight: state.bodyweight[today] || state.profile.weight || '', note: '' };
    drawPhotoDraft();
  } catch (err) { toast(err.message || '无法读取这张图片'); }
}
function drawPhotoDraft() {
  const d = pw.draft;
  openSheet('添加照片', `<img class="pw-preview" src="${d.url}" alt="">
    <label>姿势</label><div class="chips">${POSES.map(([k, l]) => chip(l, `data-pwdpose="${k}"`, d.pose === k)).join('')}</div>
    <div class="grid2"><div><label>日期</label><input type="date" id="pwDate" value="${d.date}" max="${dateKey(new Date())}"></div>
      <div><label>体重 kg</label><input type="number" inputmode="decimal" step="0.1" id="pwWeight" value="${esc(String(d.weight))}"></div></div>
    <label>备注（可选）</label><input id="pwNote" maxlength="200" placeholder="如：减脂第 4 周、早上空腹" value="${esc(d.note)}">
    <p class="muted small">🔒 照片只保存在你的账号里，别人看不到，社区里也不会出现。</p>
    <button class="btn block" data-pwd="save">保存</button>`, { type: 'pwdraft', reopen: drawPhotoDraft });
}
function readPhotoDraft() {
  if (!pw.draft || !$('#pwDate')) return;
  pw.draft.date = $('#pwDate').value || pw.draft.date;
  pw.draft.weight = $('#pwWeight').value;
  pw.draft.note = $('#pwNote').value;
}
async function savePhotoDraft(btn) {
  readPhotoDraft();
  const d = pw.draft;
  const weight = Number(d.weight) || null;
  if (weight && !(weight >= 20 && weight <= 400)) return toast('请输入正确的体重');
  btn.disabled = true; btn.textContent = '上传中…';
  try {
    const path = `${cloud.user.id}/${Date.now().toString(36)}.jpg`;
    const up = await cloud.client.storage.from(PW_BUCKET).upload(path, d.blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw up.error;
    const { data, error } = await cloud.client.from('progress_photos')
      .insert({ path, taken_on: d.date, pose: d.pose, weight, note: d.note.trim() || null }).select().single();
    if (error) { cloud.client.storage.from(PW_BUCKET).remove([path]); throw error; }
    pw.urls[path] = d.url; // show the local copy right away
    pw.list = [data].concat(pw.list || []).sort((a, b) => (a.taken_on < b.taken_on ? 1 : a.taken_on > b.taken_on ? -1 : 0));
    pw.draft = null;
    closeSheet(); render(); toast('已保存到照片墙 📸');
  } catch (err) {
    btn.disabled = false; btn.textContent = '保存';
    toast(isMissingTable(err) || /bucket/i.test(err.message || '') ? '请先在 Supabase 运行 supabase/progress_photos.sql' : `保存失败：${err.message || err}`);
  }
}

/* ---------- view / delete / compare ---------- */
function openPhoto(id) {
  const p = pwById(id);
  if (!p) return;
  openSheet(pwLabel(p), `<img class="pw-big" src="${esc(pw.urls[p.path] || '')}" alt="">
    <div class="kv"><span>日期</span><b>${fmtDate(parseKey(p.taken_on))}</b></div>
    <div class="kv"><span>姿势</span><b>${POSE_NAME[p.pose] || '其他'}</b></div>
    ${p.weight ? `<div class="kv"><span>体重</span><b>${Number(p.weight)}kg</b></div>` : ''}
    ${p.note ? `<p>${esc(p.note)}</p>` : ''}
    <button class="btn ghost block pw-del" data-pwdel="${p.id}">删除这张照片</button>`, { type: 'pwview', id });
}
async function deletePhoto(id) {
  const p = pwById(id);
  if (!p || !confirm('删除这张照片？删除后无法恢复。')) return;
  const { error } = await cloud.client.from('progress_photos').delete().eq('id', id);
  if (error) return toast(`删除失败：${error.message}`);
  cloud.client.storage.from(PW_BUCKET).remove([p.path]);
  pw.list = pw.list.filter((x) => x.id !== id);
  pw.pick = pw.pick.filter((x) => x !== id);
  closeSheet(); render(); toast('已删除');
}
function openCompare() {
  // older photo on the left
  const [a, b] = pw.pick.map(pwById).filter(Boolean).sort((x, y) => (x.taken_on < y.taken_on ? -1 : 1));
  if (!a || !b) return;
  const days = dayDiff(parseKey(a.taken_on), parseKey(b.taken_on));
  const dw = a.weight && b.weight ? Number(b.weight) - Number(a.weight) : null;
  let el = $('#pwCompare');
  if (!el) { el = document.createElement('div'); el.id = 'pwCompare'; document.body.appendChild(el); }
  el.innerHTML = `<div class="pwc-head"><b>${days ? `相隔 ${days} 天` : '同一天'}${dw !== null ? ` · 体重 ${dw >= 0 ? '+' : ''}${dw.toFixed(1)}kg` : ''}</b>
      <button class="icon-round" data-pwc="close" aria-label="关闭">${ICONS.close}</button></div>
    <div class="pwc-pair">${[a, b].map((p, i) => `<figure><img src="${esc(pw.urls[p.path] || '')}" alt=""><figcaption>${i ? '之后' : '之前'} · ${pwLabel(p)}</figcaption></figure>`).join('')}</div>`;
  el.hidden = false;
  el.onclick = (e) => { if (e.target.closest('[data-pwc]')) el.hidden = true; };
}

function photoWallClick(b) {
  const ds = b.dataset;
  if (ds.pw === 'login') return openLoginSheet();
  if (ds.pw === 'compare') { pw.compare = !pw.compare; pw.pick = []; }
  else if (ds.pwpose) pw.pose = ds.pwpose;
  else if (ds.pwid) {
    if (!pw.compare) return openPhoto(ds.pwid);
    const i = pw.pick.indexOf(ds.pwid);
    if (i >= 0) pw.pick.splice(i, 1);
    else pw.pick = pw.pick.concat(ds.pwid).slice(-2);
    if (pw.pick.length === 2) { render(); return openCompare(); }
  } else return;
  render();
}
function bindPhotos() {
  document.addEventListener('change', (e) => {
    if (e.target.id === 'pwFile' && e.target.files[0]) { openPhotoDraft(e.target.files[0]); e.target.value = ''; }
  });
  $('#sheet').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !sheetCtx) return;
    if (sheetCtx.type === 'pwdraft' && b.dataset.pwdpose) { readPhotoDraft(); pw.draft.pose = b.dataset.pwdpose; drawPhotoDraft(); }
    else if (sheetCtx.type === 'pwdraft' && b.dataset.pwd === 'save') savePhotoDraft(b);
    else if (sheetCtx.type === 'pwview' && b.dataset.pwdel) deletePhoto(b.dataset.pwdel);
  });
}
