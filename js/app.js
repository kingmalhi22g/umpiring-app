// app.js — event wiring, screen logic, state management

// ── Dark mode ─────────────────────────────────────────────
function applyDarkMode(val) {
  // val: true = dark, false = light, null = follow system
  document.body.classList.toggle('dark-mode',  val === true);
  document.body.classList.toggle('light-mode', val === false);
  // Sync 3-way toggle active state
  const map = { 'dm-auto': val === null, 'dm-on': val === true, 'dm-off': val === false };
  Object.entries(map).forEach(([id, active]) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('dm-active', active);
  });
}

// ── Haptic + debounce helpers ─────────────────────────────
function haptic() { if (navigator.vibrate) navigator.vibrate(10); }

let _lastBallTap = 0;
function debounced(fn) {
  return function(...args) {
    const now = Date.now();
    if (now - _lastBallTap < 250) return;
    _lastBallTap = now;
    fn.apply(this, args);
  };
}

const state = {
  matchId:            null,
  viewMatchId:        null,
  selectedWicketType: null,
  pendingExtrasType:  null,  // 'wide'|'no_ball'|'bye'|'leg_bye'
  runoutRuns:         0,     // runs completed before a run-out
  runoutWho:          'striker',  // which batsman is run out: 'striker'|'nonstriker'
  // Edit-ball editor state
  editIdx:            null,
  editRuns:           0,
  editExtra:          null,  // null|'wide'|'no_ball'|'bye'|'leg_bye'
  editWicket:         false,
  editOrigWicket:     null,
  editBatsman:        ''
};

// ── Init ─────────────────────────────────────────────────
function initApp() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  // Apply saved dark mode preference on startup
  applyDarkMode(getDarkMode());

  // Resume active match if one exists (before the router activates a screen,
  // so a cold load straight onto #live has its matchId ready)
  const activeId = getActiveMatchId();
  if (activeId && getMatch(activeId)) state.matchId = activeId;

  // Register screen handlers BEFORE init() so the initial screen activation
  // fires its setup handler on a cold load (otherwise e.g. the home match
  // list renders blank until you navigate away and back).
  onScreenChange(screen => {
    const handlers = {
      'home':          setupHome,
      'match-setup':   setupMatchSetup,
      'toss':          setupToss,
      'live':          setupLive,
      'end-of-over':   setupEndOfOver,
      'innings-break': setupInningsBreak,
      'summary':       setupSummary,
      'rosters':       renderRosters,
      'settings':      setupSettings
    };
    if (handlers[screen]) handlers[screen]();
  });

  init(); // router — activates the current screen and fires its handler

  wireButtons();
}

// ── Global button wiring ──────────────────────────────────
function wireButtons() {
  // Header
  on('btn-back',  'click', () => history.back());
  on('btn-menu',  'click', () => navigateTo('settings'));
  on('btn-rosters', 'click', () => navigateTo('rosters'));

  // Home
  on('btn-new-match', 'click', () => { state.matchId = null; navigateTo('match-setup'); });
  on('match-list', 'click', e => {
    // Delete affordance takes priority over opening the match
    const del = e.target.closest('.match-delete');
    if (del) {
      e.stopPropagation();
      const m = getMatch(del.dataset.del);
      if (!m) return;
      const label = m.teams[0].name + ' vs ' + m.teams[1].name;
      const delId = del.dataset.del;
      showConfirm({
        title: 'Delete match?',
        message: '"' + label + '"\n\nThis permanently removes the match and cannot be undone.',
        confirmText: 'Delete',
        onConfirm: () => {
          deleteMatch(delId);
          if (state.matchId === delId)     state.matchId = null;
          if (state.viewMatchId === delId) state.viewMatchId = null;
          renderMatchList(document.getElementById('match-list'));
          showToast('Match deleted');
        }
      });
      return;
    }
    const item = e.target.closest('.match-item');
    if (!item) return;
    const m = getMatch(item.dataset.id);
    if (!m) return;
    if (m.status === 'in_progress') { state.matchId = m.id; setActiveMatchId(m.id); navigateTo('live'); }
    else { state.viewMatchId = m.id; navigateTo('summary'); }
  });

  // Match setup
  on('btn-match-continue', 'click', handleMatchSetupContinue);
  on('ms-presets', 'click', e => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    const overInput = document.getElementById('ms-overs');
    if (chip.dataset.overs === 'custom') {
      if (overInput) overInput.focus();
    } else if (overInput) {
      overInput.value = chip.dataset.overs;
    }
    syncPresetUI();
  });
  on('ms-overs', 'input', syncPresetUI);

  // Toss
  on('btn-bat',   'click', () => handleTossElect('bat'));
  on('btn-field', 'click', () => handleTossElect('field'));

  // Openers modal
  on('btn-start-innings', 'click', handleStartInnings);

  // Ball buttons — debounced + haptic
  [0,1,2,3,4,6].forEach(r => on('ball-btn-' + r, 'click', debounced(() => { haptic(); handleBallRun(r); })));
  on('ball-btn-wd', 'click', debounced(() => { haptic(); handleBallExtra('wide'); }));
  on('ball-btn-nb', 'click', debounced(() => { haptic(); handleBallExtra('no_ball'); }));
  on('ball-btn-b',  'click', debounced(() => { haptic(); handleBallExtra('bye'); }));
  on('ball-btn-lb', 'click', debounced(() => { haptic(); handleBallExtra('leg_bye'); }));
  on('ball-btn-w',  'click', debounced(() => { haptic(); handleWicketButton(); }));
  on('btn-undo',          'click', handleUndo);
  on('btn-end-innings',   'click', handleEndInningsEarly);

  // Edit any ball — tap a dot in the current over
  on('live-dots', 'click', e => {
    const dot = e.target.closest('.ball-dot-edit');
    if (dot && dot.dataset.idx !== undefined) openEditBall(parseInt(dot.dataset.idx));
  });
  on('edit-extras-row', 'click', e => {
    const btn = e.target.closest('[data-edit-extra]');
    if (!btn) return;
    // Toggle: tapping the active extra clears it back to a normal delivery.
    state.editExtra = state.editExtra === btn.dataset.editExtra ? null : btn.dataset.editExtra;
    renderEditSelection();
  });
  document.querySelectorAll('#modal-edit-ball [data-edit-run]').forEach(b =>
    b.addEventListener('click', () => { state.editRuns = parseInt(b.dataset.editRun); renderEditSelection(); }));
  on('edit-wkt-toggle', 'click', () => { state.editWicket = !state.editWicket; renderEditSelection(); });
  on('btn-edit-save',   'click', handleEditSave);
  on('btn-edit-delete', 'click', handleEditDelete);
  on('btn-edit-cancel', 'click', () => { state.editIdx = null; closeModal(); });
  on('btn-switch-strike', 'click', handleSwitchStrike);
  on('btn-live-stats',   'click', handleOpenStats);
  on('btn-stats-close',  'click', closeModal);

  // Generic confirm dialog
  on('btn-confirm-cancel', 'click', () => { _confirmCallback = null; closeModal(); });
  on('btn-confirm-ok', 'click', () => {
    const cb = _confirmCallback;
    _confirmCallback = null;
    closeModal();
    if (cb) cb();
  });
  on('btn-export-card',  'click', handleExportCard);
  // Dark mode 3-way toggle
  [['dm-auto', null], ['dm-on', true], ['dm-off', false]].forEach(([id, val]) => {
    on(id, 'click', () => { saveDarkMode(val); applyDarkMode(val);
      showToast('Dark mode: ' + (val === null ? 'Auto (follows system)' : val ? 'On' : 'Off')); });
  });

  // Extras modal
  document.querySelectorAll('.extras-run-btn').forEach(btn =>
    btn.addEventListener('click', () => handleExtrasRuns(parseInt(btn.dataset.runs)))
  );
  on('btn-extras-cancel', 'click', closeModal);

  // Wicket modal
  document.querySelectorAll('.wicket-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.wicket-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedWicketType = btn.dataset.type;
      const showFielder = ['caught','run_out','stumped'].includes(state.selectedWicketType);
      document.getElementById('wicket-fielder-group').classList.toggle('hidden', !showFielder);
      document.getElementById('wicket-runout-group').classList.toggle('hidden', state.selectedWicketType !== 'run_out');
    })
  );
  // Run-out: runs completed + who is out
  document.querySelectorAll('#runout-runs .ro-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('#runout-runs .ro-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.runoutRuns = parseInt(btn.dataset.runs) || 0;
    })
  );
  document.querySelectorAll('#runout-who .ro-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('#runout-who .ro-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.runoutWho = btn.dataset.end;
    })
  );
  on('btn-wicket-confirm', 'click', handleWicketConfirm);
  on('btn-wicket-cancel',  'click', closeModal);

  // New batsman modal
  on('btn-new-batsman-ok', 'click', handleNewBatsmanConfirm);

  // End of over — recent bowler chips
  on('eos-recent-bowlers', 'click', e => {
    const chip = e.target.closest('.eos-bowler-chip');
    if (chip) document.getElementById('eos-next-bowler').value = chip.dataset.bowler;
  });
  on('btn-eos-continue', 'click', handleEndOfOverContinue);

  // Innings break
  on('btn-start-2nd', 'click', handleStart2ndInnings);

  // Summary
  on('btn-summary-home', 'click', () => {
    setActiveMatchId(null); state.matchId = null; state.viewMatchId = null;
    navigateTo('home');
  });
  on('summary-content', 'click', e => {
    if (e.target.closest('#btn-super-over')) { handleStartSuperOver(); return; }
    const tab = e.target.closest('.sc-tab');
    if (tab) {
      const root = document.getElementById('summary-content');
      const panel = tab.dataset.panel;
      root.querySelectorAll('.sc-tab').forEach(t => t.classList.toggle('active', t === tab));
      root.querySelectorAll('.sc-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === panel));
      return;
    }
    const head = e.target.closest('.inn-head');
    if (head && head.parentElement) head.parentElement.classList.toggle('open');
  });

  // Settings
  on('btn-save-settings', 'click', () => {
    const overs = parseInt(document.getElementById('settings-overs').value) || 20;
    saveSettings({ defaultOvers: overs });
    showToast('Settings saved');
  });
  on('btn-go-rosters', 'click', () => navigateTo('rosters'));
  on('btn-clear-data', 'click', () => {
    showConfirm({
      title: 'Clear all data?',
      message: 'Delete all matches and rosters? This cannot be undone.',
      confirmText: 'Clear all',
      onConfirm: () => { clearAll(); navigateTo('home'); showToast('All data cleared'); }
    });
  });
}

// ── Screen setup ──────────────────────────────────────────
function setupHome() {
  renderMatchList(document.getElementById('match-list'));
}

function setupSettings() {
  const oInput = document.getElementById('settings-overs');
  if (oInput) oInput.value = getSettings().defaultOvers;
  applyDarkMode(getDarkMode()); // syncs the toggle label
}

function setupMatchSetup() {
  const set = id => { const el = document.getElementById(id); if (el) el.value = ''; };
  set('ms-team1'); set('ms-team2'); set('ms-ground');
  const dateInput = document.getElementById('ms-date');
  if (dateInput) dateInput.value = new Date().toISOString().slice(0,10);
  const overInput = document.getElementById('ms-overs');
  if (overInput) overInput.value = getSettings().defaultOvers;
  syncPresetUI();
}

// Highlight the preset chip matching the current overs value and refresh quota.
function syncPresetUI() {
  const overs = parseInt(val('ms-overs')) || 0;
  const isStandard = ['10','20','50'].includes(String(overs));
  document.querySelectorAll('#ms-presets .preset-chip').forEach(chip => {
    const match = chip.dataset.overs === 'custom' ? (overs > 0 && !isStandard)
                                                  : chip.dataset.overs === String(overs);
    chip.classList.toggle('selected', match);
  });
  const hint = document.getElementById('ms-quota');
  if (hint) {
    hint.innerHTML = overs > 0
      ? 'Bowler quota: max <strong>' + getMaxBowlerOvers(overs) + ' over' +
        (getMaxBowlerOvers(overs) !== 1 ? 's' : '') + '</strong> each (auto)'
      : '';
  }
}

function setupToss() {
  const m = getMatch(state.matchId);
  if (!m) { navigateTo('home'); return; }
  const sel = document.getElementById('toss-winner');
  sel.innerHTML = m.teams.map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');
}

function setupLive() {
  const m = getMatch(state.matchId);
  if (!m) { navigateTo('home'); return; }
  const inn = m.innings[m.currentInnings];
  if (inn) document.getElementById('screen-title').textContent = inn.battingTeam + ' batting';
  renderLiveHeader(m);
}

function setupEndOfOver() {
  const m = getMatch(state.matchId);
  if (!m) return;
  const inp = document.getElementById('eos-next-bowler');
  if (inp) inp.value = '';
  renderOverSummary(m);
}

function setupInningsBreak() {
  const m = getMatch(state.matchId);
  if (m) renderInningsBreak(m);
}

function setupSummary() {
  renderMatchSummary(getMatch(state.viewMatchId || state.matchId));
}

// ── Match setup ───────────────────────────────────────────
function handleMatchSetupContinue() {
  const t1     = val('ms-team1');
  const t2     = val('ms-team2');
  const date   = val('ms-date');
  const ground = val('ms-ground');
  const overs  = parseInt(val('ms-overs')) || 20;

  if (!t1 || !t2) { showToast('Enter both team names'); return; }
  if (t1.toLowerCase() === t2.toLowerCase()) { showToast('Team names must be different'); return; }

  const m = createMatch({ team1:{name:t1}, team2:{name:t2}, date, ground, overs });
  state.matchId = m.id;
  setActiveMatchId(m.id);
  saveMatch(m);
  navigateTo('toss');
}

// ── Toss ──────────────────────────────────────────────────
function handleTossElect(elected) {
  const m = getMatch(state.matchId);
  if (!m) return;
  const winner      = val('toss-winner');
  m.toss            = { winner, elected };
  const batFirst    = elected === 'bat' ? winner : m.teams.find(t => t.name !== winner).name;
  const batIdx      = m.teams.findIndex(t => t.name === batFirst);
  const bowlIdx     = 1 - batIdx;
  m.innings[0]      = createInnings(m.teams[batIdx].name, m.teams[bowlIdx].name);
  m.currentInnings  = 0;
  m.status          = 'in_progress';
  saveMatch(m);
  showOpenersModal(m, 0);
}

// ── Openers modal ─────────────────────────────────────────
function showOpenersModal(m, innIdx) {
  const inn      = m.innings[innIdx];
  const batTeam  = m.teams.find(t => t.name === inn.battingTeam);
  const bowlTeam = m.teams.find(t => t.name === inn.bowlingTeam);

  setEl('openers-team', inn.battingTeam + ' — Opening Pair');
  document.getElementById('opener1').value       = '';
  document.getElementById('opener2').value       = '';
  document.getElementById('first-bowler').value  = '';
  const startBtn = document.getElementById('btn-start-innings');
  if (startBtn) {
    startBtn.textContent = innIdx === 0 ? 'Start Innings 1'
      : innIdx === 1 ? 'Start Innings 2'
      : innIdx === 2 ? 'Start Super Over' : 'Start Super Over Chase';
  }
  if (innIdx >= 2) setEl('openers-team', inn.battingTeam + ' — Super Over');

  populateDatalist('openers-dl', [
    ...(batTeam ? batTeam.batsmen : []),
    ...getRoster(inn.battingTeam)
  ]);
  populateDatalist('bowler-datalist', [
    ...(bowlTeam ? bowlTeam.bowlers : []),
    ...getRoster(inn.bowlingTeam)
  ]);
  openModal('modal-openers');
}

function handleStartInnings() {
  const m   = getMatch(state.matchId);
  if (!m) return;
  const inn = m.innings[m.currentInnings];
  const op1 = val('opener1') || 'Batsman 1';
  const op2 = val('opener2') || 'Batsman 2';
  const bwl = val('first-bowler');

  if (op1 === op2)   { showToast('Openers must be different players'); return; }
  if (!bwl)          { showToast('Enter first bowler name'); return; }

  setOpeners(inn, op1, op2);
  inn.currentOver = createOver(1, bwl);
  addPlayerToRoster(inn.battingTeam, op1);
  addPlayerToRoster(inn.battingTeam, op2);
  addPlayerToRoster(inn.bowlingTeam, bwl);
  saveMatch(m);
  closeModal();
  navigateTo('live');
}

// ── Ball recording ────────────────────────────────────────
function handleBallRun(runs) {
  let m = getMatch(state.matchId);
  if (!canRecord(m)) return;
  m = recordBall(m, { runs, extras: { type: null, runs: 0 } });
  saveMatch(m);
  afterBall(m);
}

function handleBallExtra(type) {
  state.pendingExtrasType = type;
  const cfg = {
    wide:    { title: 'Wide — extra runs?',      runs: [0,1,2,3,4] },
    no_ball: { title: 'No Ball — runs off bat?', runs: [0,1,2,3,4,6] },
    bye:     { title: 'Bye — how many runs?',   runs: [1,2,3,4] },
    leg_bye: { title: 'Leg Bye — how many runs?', runs: [1,2,3,4] }
  }[type];

  setEl('extras-modal-title', cfg.title);
  const grid = document.getElementById('extras-runs-grid');
  grid.innerHTML = cfg.runs.map(r =>
    `<button class="ball-btn extras-run-btn" data-runs="${r}" type="button">${r}</button>`
  ).join('');
  grid.querySelectorAll('.extras-run-btn').forEach(btn =>
    btn.addEventListener('click', () => handleExtrasRuns(parseInt(btn.dataset.runs)))
  );
  openModal('modal-extras');
}

function handleExtrasRuns(runs) {
  const type = state.pendingExtrasType;
  if (!type) return;
  let m = getMatch(state.matchId);
  if (!canRecord(m)) { closeModal(); return; }

  // For wide/no_ball, 'runs' in the modal means different things:
  // wide: total wides (so extra penalty runs = runs - 1)
  // no_ball: runs off bat (penalty 1 is added automatically in match.js)
  // wide: extra runs beyond penalty; no_ball: bat runs go in delivery.runs only (extras.runs=0 avoids double-count); bye/lb: run count
  const extras = type === 'no_ball' ? { type, runs: 0 } : { type, runs };

  const ballRuns = (type === 'bye' || type === 'leg_bye') ? 0 : (type === 'no_ball' ? runs : 0);

  // For bye/lb, match.js uses delivery.runs for the actual run count
  m = recordBall(m, { runs: (type === 'bye' || type === 'leg_bye') ? runs : ballRuns, extras });
  saveMatch(m);
  closeModal();
  state.pendingExtrasType = null;
  afterBall(m);
}

// ── Wicket ────────────────────────────────────────────────
function handleWicketButton() {
  const m = getMatch(state.matchId);
  if (!canRecord(m)) return;
  const inn     = m.innings[m.currentInnings];
  const striker = inn.batsmen[inn.strikerIdx];
  if (!striker) return;

  document.querySelectorAll('.wicket-btn').forEach(b => b.classList.remove('selected'));
  state.selectedWicketType = null;
  setEl('wicket-batsman-name', striker.name);
  document.getElementById('wicket-fielder').value = '';
  document.getElementById('wicket-fielder-group').classList.add('hidden');

  // Reset run-out controls
  const nonStriker = inn.batsmen[inn.nonStrikerIdx];
  state.runoutRuns = 0;
  state.runoutWho  = 'striker';
  setEl('ro-who-striker',    striker.name);
  setEl('ro-who-nonstriker', nonStriker ? nonStriker.name : 'Non-striker');
  document.querySelectorAll('#runout-runs .ro-btn').forEach(b => b.classList.toggle('selected', b.dataset.runs === '0'));
  document.querySelectorAll('#runout-who .ro-btn').forEach(b => b.classList.toggle('selected', b.dataset.end === 'striker'));
  document.getElementById('wicket-runout-group').classList.add('hidden');

  const fhEl = document.getElementById('wicket-freehit-warning');
  if (fhEl) fhEl.classList.toggle('hidden', !inn.freeHitNext);
  openModal('modal-wicket');
}

function handleWicketConfirm() {
  let m     = getMatch(state.matchId);
  const inn = m.innings[m.currentInnings];

  const wType = state.selectedWicketType;

  // Retirement is not a delivery — handle separately (no ball recorded).
  if (wType === 'retired_hurt' || wType === 'retired_out') {
    handleRetire(m, inn, wType);
    return;
  }

  if (inn.freeHitNext && wType && wType !== 'run_out') {
    showToast('Free hit — only run-out is valid'); return;
  }

  const striker    = inn.batsmen[inn.strikerIdx];
  const nonStriker = inn.batsmen[inn.nonStrikerIdx];

  const isRunOut   = wType === 'run_out';
  const runoutRuns = isRunOut ? (state.runoutRuns || 0) : 0;
  const batsmanOut = (isRunOut && state.runoutWho === 'nonstriker' && nonStriker)
    ? nonStriker.name : striker.name;

  const wicket  = {
    type:        wType || 'out',
    batsmanOut:  batsmanOut,
    fielder:     val('wicket-fielder') || null,
    bowlerCredit: wType ? !['run_out','obstructing'].includes(wType) : true
  };

  m = recordBall(m, { runs: runoutRuns, extras: { type: null, runs: 0 }, isWicket: true, wicket });
  closeModal();

  const updatedInn = m.innings[m.currentInnings];
  if (updatedInn.wickets >= effectiveMaxWickets(m)) {
    saveMatch(m);
    endInnings(m);
    return;
  }

  saveMatch(m);

  // Show new batsman
  const batTeam = m.teams.find(t => t.name === updatedInn.battingTeam);
  const taken   = new Set(updatedInn.batsmen.map(b => b.name));
  populateDatalist('new-batsman-dl', [
    ...(batTeam ? batTeam.batsmen : []),
    ...getRoster(updatedInn.battingTeam)
  ].filter(n => !taken.has(n)));

  document.getElementById('new-batsman-name').value = '';
  const howLabel = wType ? wType.replace(/_/g,' ') : 'out';
  const runsNote = runoutRuns > 0 ? ' · ' + runoutRuns + ' run' + (runoutRuns > 1 ? 's' : '') + ' completed' : '';
  setEl('new-batsman-info', wicket.batsmanOut + ' out · ' + howLabel + runsNote);
  openModal('modal-new-batsman');
}

// Retired hurt / out — mark the striker and bring in a replacement (no ball).
function handleRetire(m, inn, type) {
  const striker = inn.batsmen[inn.strikerIdx];
  if (!striker) { closeModal(); return; }
  const isOut = type === 'retired_out';
  striker.retired = true;
  striker.isOut   = isOut;
  striker.how     = isOut ? 'retired out' : 'retired hurt';
  if (isOut) inn.wickets++;
  closeModal();

  if (isOut && inn.wickets >= effectiveMaxWickets(m)) {
    saveMatch(m);
    endInnings(m);
    return;
  }
  saveMatch(m);

  const batTeam = m.teams.find(t => t.name === inn.battingTeam);
  const taken   = new Set(inn.batsmen.map(b => b.name));
  populateDatalist('new-batsman-dl', [
    ...(batTeam ? batTeam.batsmen : []),
    ...getRoster(inn.battingTeam)
  ].filter(n => !taken.has(n)));
  document.getElementById('new-batsman-name').value = '';
  setEl('new-batsman-info', striker.name + ' ' + striker.how + ' · select replacement');
  openModal('modal-new-batsman');
}

function handleNewBatsmanConfirm() {
  let m = getMatch(state.matchId);
  const inn = m.innings[m.currentInnings];
  const name = val('new-batsman-name') || ('Batsman ' + (inn.batsmen.length + 1));
  addBatsman(inn, name);
  addPlayerToRoster(inn.battingTeam, name);
  saveMatch(m);
  closeModal();
  renderLiveHeader(m);
  afterBall(m);
}

function handleOpenStats() {
  const m = getMatch(state.matchId);
  if (!m) return;
  renderStatsModal(m);
  openModal('modal-stats');
}

function handleExportCard() {
  const idToUse = state.viewMatchId || state.matchId;
  const m = getMatch(idToUse);
  if (!m) { showToast('No match data to export'); return; }
  showToast('Generating scorecard…', 3000);
  renderExportCard(m);
  setTimeout(() => {
    const card = document.getElementById('export-card');
    if (!card || typeof html2canvas === 'undefined') { showToast('Export unavailable'); return; }
    html2canvas(card, { scale: 2, useCORS: true, backgroundColor: '#1B5E20' }).then(canvas => {
      canvas.toBlob(blob => {
        if (!blob) { showToast('Could not generate image'); return; }
        const url = URL.createObjectURL(blob);
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'scorecard.png', { type: 'image/png' })] })) {
          navigator.share({ files: [new File([blob], 'scorecard.png', { type: 'image/png' })], title: 'Match Scorecard' })
            .catch(() => _downloadScorecard(url));
        } else {
          _downloadScorecard(url);
        }
      }, 'image/png');
    }).catch(() => showToast('Export failed'));
  }, 200);
}

function _downloadScorecard(url) {
  const a = document.createElement('a');
  a.href = url; a.download = 'scorecard.png';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  showToast('Scorecard saved!');
}

function handleSwitchStrike() {
  const m = getMatch(state.matchId);
  if (!m) return;
  const inn = m.innings[m.currentInnings];
  if (!inn) return;
  const tmp = inn.strikerIdx;
  inn.strikerIdx = inn.nonStrikerIdx;
  inn.nonStrikerIdx = tmp;
  saveMatch(m);
  renderLiveHeader(m);
  haptic();
}

function handleUndo() {
  let m = getMatch(state.matchId);
  if (!m) return;
  const inn = m.innings[m.currentInnings];
  if (!inn || !inn.currentOver || inn.currentOver.allDeliveries.length === 0) {
    showToast('Nothing to undo'); return;
  }
  m = undoLastBall(m);
  saveMatch(m);
  renderLiveHeader(m);
  showToast('Last ball undone ↩');
}

// ── Edit any ball ─────────────────────────────────────────
function openEditBall(idx) {
  const m = getMatch(state.matchId);
  if (!m) return;
  const inn = m.innings[m.currentInnings];
  const over = inn && inn.currentOver;
  const d = over && over.allDeliveries[idx];
  if (!d) return;

  const eType = d.extras ? d.extras.type : null;
  // Reconstruct the editor's run value from how the delivery stored it.
  let runs;
  if (eType === 'wide')      runs = d.extras.runs || 0;   // extra runs beyond penalty
  else                       runs = d.runs || 0;          // normal / nb-bat / bye / leg-bye

  state.editIdx        = idx;
  state.editRuns       = runs;
  state.editExtra      = eType;
  state.editWicket     = !!d.isWicket;
  state.editOrigWicket = d.wicket || null;
  state.editBatsman    = d.batsman || (inn.batsmen[inn.strikerIdx] ? inn.batsmen[inn.strikerIdx].name : '');

  setEl('edit-ball-title', 'Edit ball ' + (idx + 1) + ' · over ' + over.overNumber);
  setEl('edit-ball-current', 'Currently recorded: ' + ballDotLabel(d).replace(/·/, 'dot ball'));
  renderEditSelection();
  openModal('modal-edit-ball');
}

function renderEditSelection() {
  document.querySelectorAll('#modal-edit-ball [data-edit-run]').forEach(b =>
    b.classList.toggle('selected', parseInt(b.dataset.editRun) === state.editRuns));
  document.querySelectorAll('#modal-edit-ball [data-edit-extra]').forEach(b =>
    b.classList.toggle('selected', b.dataset.editExtra === state.editExtra));
  const wt = document.getElementById('edit-wkt-toggle');
  if (wt) { wt.classList.toggle('on', state.editWicket); wt.setAttribute('aria-pressed', String(state.editWicket)); }
}

function buildEditPatch() {
  const t = state.editExtra;
  let runs, extras;
  if (!t)                     { runs = state.editRuns; extras = { type: null, runs: 0 }; }
  else if (t === 'wide')      { runs = 0;              extras = { type: 'wide', runs: state.editRuns }; }
  else if (t === 'no_ball')   { runs = state.editRuns; extras = { type: 'no_ball', runs: 0 }; }
  else                        { runs = state.editRuns; extras = { type: t, runs: state.editRuns }; }

  let isWicket = false, wicket = null;
  if (state.editWicket) {
    isWicket = true;
    const ow = state.editOrigWicket;
    const baseType = (ow && ow.type) || 'out';
    wicket = {
      type: baseType,
      batsmanOut: (ow && ow.batsmanOut) || state.editBatsman,
      fielder: (ow && ow.fielder) || null,
      bowlerCredit: ow ? ow.bowlerCredit : !['run_out','obstructing'].includes(baseType)
    };
  }
  return { runs, extras, isWicket, wicket };
}

function handleEditSave() {
  let m = getMatch(state.matchId);
  if (!m || state.editIdx === null) { closeModal(); return; }
  m = editCurrentBall(m, state.editIdx, buildEditPatch());
  closeModal();
  state.editIdx = null;
  afterEdit(m);
  showToast('Ball updated');
}

function handleEditDelete() {
  let m = getMatch(state.matchId);
  if (!m || state.editIdx === null) { closeModal(); return; }
  const idx = state.editIdx;
  closeModal();
  state.editIdx = null;
  showConfirm({
    title: 'Delete this ball?',
    message: 'The delivery is removed and the over re-scored.',
    confirmText: 'Delete',
    onConfirm: () => {
      let mm = getMatch(state.matchId);
      mm = deleteCurrentBall(mm, idx);
      afterEdit(mm);
      showToast('Ball deleted');
    }
  });
}

// Persist + route after an edit/delete (mirrors afterBall's end-state checks).
function afterEdit(m) {
  const inn = m.innings[m.currentInnings];
  saveMatch(m);
  if (m.currentInnings === 1) {
    const target = getTarget(m);
    if (target && inn.totalRuns >= target) { endInnings(m); return; }
  }
  if (inn.wickets >= 10) { endInnings(m); return; }
  if (!inn.currentOver) {
    if (isInningsComplete(inn, m.overs)) { endInnings(m); return; }
    navigateTo('end-of-over'); return;
  }
  renderLiveHeader(m);
}

// ── After ball ────────────────────────────────────────────
function afterBall(m) {
  const inn = m.innings[m.currentInnings];
  if (!inn) return;

  // Target reached when chasing (2nd innings, or 2nd super-over innings)?
  if (m.currentInnings === 1 || m.currentInnings === 3) {
    const target = getTarget(m);
    if (target && inn.totalRuns >= target) { endInnings(m); return; }
  }

  // All out?
  if (inn.wickets >= effectiveMaxWickets(m)) { endInnings(m); return; }

  // Over complete?
  if (isOverComplete(inn.currentOver)) {
    m = completeOver(m);
    const updatedInn = m.innings[m.currentInnings];
    saveMatch(m);
    if (isInningsComplete(updatedInn, effectiveOvers(m), effectiveMaxWickets(m))) {
      endInnings(m);
    } else {
      navigateTo('end-of-over');
    }
    return;
  }

  renderLiveHeader(m);
}

function handleEndInningsEarly() {
  const m = getMatch(state.matchId);
  if (!m) return;
  const inn = m.innings[m.currentInnings];
  const runsLeft = inn ? (inn.totalRuns + ' / ' + inn.wickets) : '';
  showConfirm({
    title: 'End innings now?',
    message: (runsLeft ? 'Current score: ' + runsLeft + '\n' : '') +
             'Remaining wickets and overs will not be used.',
    confirmText: 'End innings',
    onConfirm: () => {
      // Close any open over into completed overs before ending
      if (inn.currentOver && inn.currentOver.balls.length > 0) {
        inn.currentOver.completed = true;
        inn.overs.push(inn.currentOver);
        inn.currentOver = null;
      }
      saveMatch(m);
      endInnings(m);
    }
  });
}

function endInnings(m) {
  m.innings[m.currentInnings].completed = true;

  if (m.currentInnings === 0) {
    saveMatch(m);
    navigateTo('innings-break');
    return;
  }

  if (m.currentInnings === 2) {
    // First super-over innings done → start the chase
    const i2 = m.innings[2];
    m.innings[3]     = createInnings(i2.bowlingTeam, i2.battingTeam);
    m.currentInnings = 3;
    saveMatch(m);
    showOpenersModal(m, 3);
    return;
  }

  if (m.currentInnings === 3) {
    // Super over complete
    m.result = checkSuperOverResult(m);
  } else {
    m.result = checkResult(m);
  }

  m.status = 'completed';
  setActiveMatchId(null);
  state.viewMatchId = m.id;
  state.matchId     = null;
  savePlayersFromMatch(m);
  saveMatch(m);
  navigateTo('summary');
}

function handleStartSuperOver() {
  const m = getMatch(state.viewMatchId) || getMatch(state.matchId);
  if (!m) return;
  const i1 = m.innings[1];
  // Super over: team that bowled 2nd innings now bats first
  m.innings[2]      = createInnings(i1.bowlingTeam, i1.battingTeam);
  m.currentInnings  = 2;
  m.result          = null;
  m.status          = 'in_progress';
  state.matchId     = m.id;
  state.viewMatchId = null;
  setActiveMatchId(m.id);
  saveMatch(m);
  showOpenersModal(m, 2);
}

// ── End of over ───────────────────────────────────────────
function handleEndOfOverContinue() {
  const bowler = val('eos-next-bowler');
  if (!bowler) { showToast('Enter next bowler name'); return; }
  const m0   = getMatch(state.matchId);
  const inn0 = m0.innings[m0.currentInnings];
  const lastBowler = inn0.overs.length ? inn0.overs[inn0.overs.length - 1].bowler : null;
  if (lastBowler && bowler.trim().toLowerCase() === lastBowler.toLowerCase()) {
    showToast(lastBowler + ' just bowled — choose a different bowler'); return;
  }
  const maxOv = getMaxBowlerOvers(m0.overs);
  const alreadyBowled = inn0.overs.filter(o => o.bowler.toLowerCase() === bowler.trim().toLowerCase()).length;
  if (alreadyBowled >= maxOv) {
    showToast(bowler + ' has already bowled ' + maxOv + ' overs (maximum)'); return;
  }
  let m = getMatch(state.matchId);
  m = startNewOver(m, bowler);
  addPlayerToRoster(m.innings[m.currentInnings].bowlingTeam, bowler);
  saveMatch(m);
  navigateTo('live');
}

// ── 2nd innings ───────────────────────────────────────────
function handleStart2ndInnings() {
  const m   = getMatch(state.matchId);
  if (!m) return;
  const i0  = m.innings[0];
  const bat = m.teams.find(t => t.name !== i0.battingTeam);
  const bwl = m.teams.find(t => t.name === i0.battingTeam);
  m.innings[1]     = createInnings(bat.name, bwl.name);
  m.currentInnings = 1;
  saveMatch(m);
  showOpenersModal(m, 1);
}

// ── Modals ────────────────────────────────────────────────
function openModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

// In-app replacement for window.confirm — runs onConfirm when the user accepts.
let _confirmCallback = null;
function showConfirm(opts) {
  const o = opts || {};
  setEl('confirm-title', o.title || 'Are you sure?');
  document.getElementById('confirm-message').textContent = o.message || '';
  const ok = document.getElementById('btn-confirm-ok');
  ok.textContent = o.confirmText || 'Confirm';
  ok.className = 'btn ' + (o.danger === false ? 'btn-primary' : 'btn-danger');
  setEl('btn-confirm-cancel', o.cancelText || 'Cancel');
  _confirmCallback = typeof o.onConfirm === 'function' ? o.onConfirm : null;
  openModal('modal-confirm');
}

// Exposed for inline onclick in rosters
function handleRemovePlayer(team, player) {
  removePlayerFromRoster(team, player);
  renderRosters();
}

// ── Helpers ───────────────────────────────────────────────
function canRecord(m) {
  if (!m) return false;
  const inn = m.innings[m.currentInnings];
  if (!inn || !inn.currentOver) { showToast('No over in progress'); return false; }
  if (inn.strikerIdx < 0)        { showToast('Set opening batsmen first'); return false; }
  return true;
}

function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

document.addEventListener('DOMContentLoaded', initApp);
