// app.js — event wiring, screen logic, state management

const state = {
  matchId:            null,
  viewMatchId:        null,
  selectedWicketType: null,
  pendingExtrasType:  null   // 'wide'|'no_ball'|'bye'|'leg_bye'
};

// ── Init ─────────────────────────────────────────────────
function initApp() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  init(); // router

  // Resume active match if one exists
  const activeId = getActiveMatchId();
  if (activeId && getMatch(activeId)) state.matchId = activeId;

  onScreenChange(screen => {
    const handlers = {
      'home':          setupHome,
      'match-setup':   setupMatchSetup,
      'toss':          setupToss,
      'live':          setupLive,
      'end-of-over':   setupEndOfOver,
      'innings-break': setupInningsBreak,
      'summary':       setupSummary,
      'rosters':       renderRosters
    };
    if (handlers[screen]) handlers[screen]();
  });

  wireButtons();
}

// ── Global button wiring ──────────────────────────────────
function wireButtons() {
  // Header
  on('btn-back',  'click', () => history.back());
  on('btn-menu',  'click', () => navigateTo('rosters'));

  // Home
  on('btn-new-match', 'click', () => { state.matchId = null; navigateTo('match-setup'); });
  on('match-list', 'click', e => {
    const item = e.target.closest('.match-item');
    if (!item) return;
    const m = getMatch(item.dataset.id);
    if (!m) return;
    if (m.status === 'in_progress') { state.matchId = m.id; setActiveMatchId(m.id); navigateTo('live'); }
    else { state.viewMatchId = m.id; navigateTo('summary'); }
  });

  // Match setup
  on('btn-match-continue', 'click', handleMatchSetupContinue);

  // Toss
  on('btn-bat',   'click', () => handleTossElect('bat'));
  on('btn-field', 'click', () => handleTossElect('field'));

  // Openers modal
  on('btn-start-innings', 'click', handleStartInnings);

  // Ball buttons
  [0,1,2,3,4,6].forEach(r => on('ball-btn-' + r, 'click', () => handleBallRun(r)));
  on('ball-btn-wd', 'click', () => handleBallExtra('wide'));
  on('ball-btn-nb', 'click', () => handleBallExtra('no_ball'));
  on('ball-btn-b',  'click', () => handleBallExtra('bye'));
  on('ball-btn-lb', 'click', () => handleBallExtra('leg_bye'));
  on('ball-btn-w',  'click', handleWicketButton);
  on('btn-undo',    'click', handleUndo);

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

  // Settings — clear data
  on('btn-clear-data', 'click', () => {
    if (confirm('Delete all matches and rosters? This cannot be undone.')) {
      clearAll(); navigateTo('home'); showToast('All data cleared');
    }
  });
}

// ── Screen setup ──────────────────────────────────────────
function setupHome() {
  renderMatchList(document.getElementById('match-list'));
}

function setupMatchSetup() {
  const dateInput = document.getElementById('ms-date');
  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0,10);
  const overInput = document.getElementById('ms-overs');
  if (overInput && !overInput.value) overInput.value = getSettings().defaultOvers;
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
  if (m) renderOverSummary(m);
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
  if (startBtn) startBtn.textContent = innIdx === 0 ? 'Start Innings 1' : 'Start Innings 2';

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
    wide:    { title: 'Wide — total runs?',     runs: [1,2,3,4,5] },
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
  const extras = type === 'wide'
    ? { type, runs: runs - 1 }   // eRuns = penalty extras beyond the 1
    : { type, runs };            // for no_ball: runs off bat; for bye/lb: run count

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
  const fhEl = document.getElementById('wicket-freehit-warning');
  if (fhEl) fhEl.classList.toggle('hidden', !inn.freeHitNext);
  openModal('modal-wicket');
}

function handleWicketConfirm() {
  if (!state.selectedWicketType) { showToast('Select dismissal type'); return; }
  let m     = getMatch(state.matchId);
  const inn = m.innings[m.currentInnings];

  if (inn.freeHitNext && state.selectedWicketType !== 'run_out') {
    showToast('Free hit — only run-out is valid'); return;
  }

  const striker = inn.batsmen[inn.strikerIdx];
  const wicket  = {
    type:        state.selectedWicketType,
    batsmanOut:  striker.name,
    fielder:     val('wicket-fielder') || null,
    bowlerCredit:!['run_out','obstructing'].includes(state.selectedWicketType)
  };

  m = recordBall(m, { runs: 0, extras: { type: null, runs: 0 }, isWicket: true, wicket });
  closeModal();

  const updatedInn = m.innings[m.currentInnings];
  if (updatedInn.wickets >= 10) {
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
  setEl('new-batsman-info', wicket.batsmanOut + ' out · ' + wicket.type.replace(/_/g,' '));
  openModal('modal-new-batsman');
}

function handleNewBatsmanConfirm() {
  const name = val('new-batsman-name');
  if (!name) { showToast('Enter new batsman name'); return; }
  let m = getMatch(state.matchId);
  const inn = m.innings[m.currentInnings];
  addBatsman(inn, name);
  addPlayerToRoster(inn.battingTeam, name);
  saveMatch(m);
  closeModal();
  renderLiveHeader(m);
  afterBall(m);
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

// ── After ball ────────────────────────────────────────────
function afterBall(m) {
  const inn = m.innings[m.currentInnings];
  if (!inn) return;

  // Target reached in 2nd innings?
  if (m.currentInnings === 1) {
    const target = getTarget(m);
    if (target && inn.totalRuns >= target) { endInnings(m); return; }
  }

  // 10 wickets?
  if (inn.wickets >= 10) { endInnings(m); return; }

  // Over complete?
  if (isOverComplete(inn.currentOver)) {
    m = completeOver(m);
    const updatedInn = m.innings[m.currentInnings];
    saveMatch(m);
    if (isInningsComplete(updatedInn, m.overs)) {
      endInnings(m);
    } else {
      navigateTo('end-of-over');
    }
    return;
  }

  renderLiveHeader(m);
}

function endInnings(m) {
  m.innings[m.currentInnings].completed = true;
  if (m.currentInnings === 0) {
    saveMatch(m);
    navigateTo('innings-break');
  } else {
    m.result = checkResult(m);
    m.status = 'completed';
    setActiveMatchId(null);
    state.viewMatchId = m.id;
    state.matchId     = null;
    savePlayersFromMatch(m);
    saveMatch(m);
    navigateTo('summary');
  }
}

// ── End of over ───────────────────────────────────────────
function handleEndOfOverContinue() {
  const bowler = val('eos-next-bowler');
  if (!bowler) { showToast('Enter next bowler name'); return; }
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
