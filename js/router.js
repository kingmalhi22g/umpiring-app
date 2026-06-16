// router.js — hash-based screen navigation

const SCREEN_TITLES = {
  'home':          'Cricket Umpire',
  'match-setup':   'New Match',
  'toss':          'Toss',
  'live':          'Live Match',
  'end-of-over':   'End of Over',
  'innings-break': 'Innings Break',
  'summary':       'Match Summary',
  'settings':      'Settings'
};

// Screens where the back button should show
const BACK_SCREENS = ['match-setup','toss','settings'];

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

  document.body.dataset.screen = screen;

  // Update header
  const titleEl = document.getElementById('screen-title');
  if (titleEl) titleEl.textContent = SCREEN_TITLES[screen] || 'Cricket Umpire';

  const backBtn = document.getElementById('btn-back');
  if (backBtn) {
    const isSummary = screen === 'summary';
    backBtn.hidden = !(BACK_SCREENS.includes(screen) || isSummary);
    // On the finished-match summary, the left button is Home; elsewhere it's Back.
    backBtn.innerHTML = isSummary
      ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/></svg>'
      : '←';
    backBtn.setAttribute('aria-label', isSummary ? 'Home' : 'Back');
  }

  _onChangeCallbacks.forEach(cb => cb(screen));
}

function onScreenChange(cb) { _onChangeCallbacks.push(cb); }

function init() {
  window.addEventListener('hashchange', () => _activate(getCurrentScreen()));
  _activate(getCurrentScreen());
}
