// router.js — hash-based screen navigation

const SCREEN_TITLES = {
  'home':          'Cricket Umpire',
  'match-setup':   'New Match',
  'player-setup':  'Squad Setup',
  'toss':          'Toss',
  'live':          'Live Match',
  'end-of-over':   'End of Over',
  'innings-break': 'Innings Break',
  'summary':       'Match Summary',
  'rosters':       'Manage Rosters',
  'settings':      'Settings'
};

// Screens where the back button should show
const BACK_SCREENS = ['match-setup','player-setup','toss','rosters','settings'];

// Screens where the live match header info should show
const LIVE_SCREENS = ['live','end-of-over'];

let _onChangeCallbacks = [];

function navigateTo(screen) {
  window.location.hash = '#' + screen;
}

function getCurrentScreen() {
  return (window.location.hash || '#home').slice(1) || 'home';
}

function _activate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + screen);
  if (el) el.classList.add('active');

  // Update header
  const titleEl = document.getElementById('screen-title');
  if (titleEl) titleEl.textContent = SCREEN_TITLES[screen] || 'Cricket Umpire';

  const backBtn = document.getElementById('btn-back');
  if (backBtn) backBtn.hidden = !BACK_SCREENS.includes(screen);

  _onChangeCallbacks.forEach(cb => cb(screen));
}

function onScreenChange(cb) { _onChangeCallbacks.push(cb); }

function init() {
  window.addEventListener('hashchange', () => _activate(getCurrentScreen()));
  _activate(getCurrentScreen());
}
