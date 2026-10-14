'use strict';
/* Shell: navigation, rendering, boot. */

let currentView = 'home';
const TABS = [['home', '训练', 'train'], ['challenge', '挑战', 'challenge'], ['library', '动作', 'library'], ['history', '历史', 'history'], ['me', '我的', 'me']];
const RENDER = { home: renderHome, challenge: renderChallenge, library: renderLibrary, history: renderHistory, me: renderMe, workout: renderWorkout };

function render() {
  if (!state.onboarded && !wiz) { startWizard(false); return; }
  const mode = wiz ? 'wizard' : currentView;
  document.body.dataset.mode = mode;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${mode}`));
  $('.tabbar').innerHTML = TABS.map(([k, label, icon]) => `<button data-view="${k}" class="${currentView === k ? 'active' : ''}">${ICONS[icon]}<span>${label}</span></button>`).join('');
  if (wiz) return renderWizard();
  RENDER[currentView]();
}

$('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  if (b.dataset.view === 'me' || b.dataset.view !== currentView) meSub = null;
  currentView = b.dataset.view;
  render(); window.scrollTo(0, 0);
});
$('[data-fab]').addEventListener('click', () => {
  const t = todayInfo();
  if (!t.pos) return toast('计划还没开始');
  if (t.sid === 'rest') { currentView = 'home'; homeTab = 'today'; render(); return toast('今天推荐休息，想练的话先选一个训练日'); }
  currentView = 'workout'; render(); window.scrollTo(0, 0);
});

bindCloud(); bindWizard(); bindHome(); bindSheet(); bindWorkout(); bindChallenge(); bindLibrary(); bindHistory(); bindNutrition(); bindSettings(); bindMe();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    reg.update();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update(); });
  }).catch(() => {});
  // A new version took over: reload once so the page runs the new code
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !wiz) { scheduleReminders(); render(); } });
cloudInit();
render();
scheduleReminders();
