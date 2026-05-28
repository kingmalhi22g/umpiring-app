// ui.js — DOM render helpers

// ── Ball dot ─────────────────────────────────────────────
function ballDotClass(delivery) {
  if (!delivery) return 'bd-dot';
  if (delivery.isWicket) return 'bd-w';
  const eType = delivery.extras ? delivery.extras.type : null;
  if (eType === 'wide')   return 'bd-wd';
  if (eType === 'no_ball') return 'bd-nb';
  if (eType === 'bye')    return 'bd-bye';
  if (eType === 'leg_bye') return 'bd-lb';
  if (delivery.runs === 6) return 'bd-6';
  if (delivery.runs === 4) return 'bd-4';
  if (delivery.runs > 0)  return 'bd-' + delivery.runs;
  return 'bd-dot';
}

function ballDotLabel(delivery) {
  if (!delivery) return '·';
  if (delivery.isWicket) return 'W';
  const eType = delivery.extras ? delivery.extras.type : null;
  const eRuns = delivery.extras ? (delivery.extras.runs || 0) : 0;
  if (eType === 'wide')    return eRuns > 0 ? 'Wd+' + eRuns : 'Wd';
  if (eType === 'no_ball') return delivery.runs > 0 ? 'NB+' + delivery.runs : 'NB';
  if (eType === 'bye')     return 'B';
  if (eType === 'leg_bye') return 'LB';
  if (delivery.runs === 0) return '·';
  return String(delivery.runs);
}

function renderBallDots(containerEl, over) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  if (!over) return;
  const deliveries = over.allDeliveries;
  if (deliveries.length === 0) {
    containerEl.innerHTML = '<span class="text-2 text-sm">No balls bowled yet</span>';
    return;
  }
  deliveries.forEach(d => {
    const dot = document.createElement('div');
    dot.className = 'ball-dot ' + ballDotClass(d);
    dot.textContent = ballDotLabel(d);
    containerEl.appendChild(dot);
  });
}

// ── Live match display ────────────────────────────────────
function renderLiveHeader(match) {
  if (!match) return;
  const inn = match.innings[match.currentInnings];
  if (!inn) return;

  setEl('live-score-team', inn.battingTeam);
  setEl('live-score-runs', inn.totalRuns);
  setEl('live-score-wkts', inn.wickets);
  setEl('live-score-overs', getOverDisplay(inn) + ' ov');

  const ballsBowled = inn.overs.length * 6 + (inn.currentOver ? inn.currentOver.balls.length : 0);
  const crr = ballsBowled > 0 ? (inn.totalRuns / (ballsBowled / 6)).toFixed(2) : null;
  setEl('live-stat-crr', crr || '—');

  const pship = getPartnership(inn);
  setEl('live-stat-pship', pship.runs + ' (' + pship.balls + ')');

  const target = match.currentInnings === 1 ? getTarget(match) : null;
  const needEl = document.getElementById('stat-need');
  if (target) {
    const ballsLeft  = Math.max(0, match.overs * 6 - ballsBowled);
    const runsNeeded = Math.max(0, target - inn.totalRuns);
    setEl('live-stat-need', runsNeeded + ' in ' + ballsLeft);
    if (needEl) needEl.classList.remove('hidden');
  } else if (needEl) {
    needEl.classList.add('hidden');
  }

  // Batsmen
  const striker    = inn.batsmen[inn.strikerIdx];
  const nonStriker = inn.batsmen[inn.nonStrikerIdx];
  renderBatsmanRow('live-striker',     striker,    true);
  renderBatsmanRow('live-nonstriker',  nonStriker, false);

  // Bowler
  if (inn.currentOver) {
    const bowler = inn.currentOver.bowler;
    setEl('live-bowler-name', bowler);
    setEl('live-bowler-fig',  getBowlerFigures(inn, bowler));
  }

  // Ball dots
  renderBallDots(document.getElementById('live-dots'), inn.currentOver);

  // Free hit badge
  const fhEl = document.getElementById('live-freehit');
  if (fhEl) fhEl.classList.toggle('hidden', !inn.freeHitNext);
}

function renderBatsmanRow(elId, batsman, isStriker) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!batsman) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.classList.toggle('player-on-strike', isStriker);
  const nameEl  = el.querySelector('.player-name');
  const scoreEl = el.querySelector('.player-score');
  if (nameEl)  nameEl.textContent  = batsman.name;
  let score = batsman.runs + ' (' + batsman.balls + ')';
  if (isStriker && batsman.balls > 0) {
    score += ' · SR ' + Math.round(batsman.runs / batsman.balls * 100);
  }
  if (scoreEl) scoreEl.textContent = score;
}

// ── Match list (home) ─────────────────────────────────────
function renderMatchList(containerEl) {
  const matches = getMatches();
  containerEl.innerHTML = '';
  if (matches.length === 0) {
    containerEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏏</div>
        <p>No matches yet.<br>Tap <strong>New Match</strong> to start.</p>
      </div>`;
    return;
  }
  matches.forEach(m => {
    const div = document.createElement('div');
    div.className = 'match-item' + (m.status === 'in_progress' ? ' in-progress' : '');
    div.dataset.id = m.id;
    const t1 = m.teams[0].name, t2 = m.teams[1].name;
    let resultText = m.result
      ? (m.result.marginType === 'tie' ? 'Tie' : (m.result.winner + ' won'))
      : (m.status === 'in_progress' ? 'In progress' : 'Setup');
    div.innerHTML = `
      <div class="match-info">
        <div class="match-teams">${esc(t1)} vs ${esc(t2)}</div>
        <div class="match-meta">${esc(m.date)} · ${esc(m.ground||'Unknown ground')}</div>
      </div>
      <div class="match-result">${esc(resultText)}</div>`;
    containerEl.appendChild(div);
  });
}

// ── Bowling table (used in summary) ──────────────────────
function renderBowlingTable(inn) {
  const seen = new Set();
  const bowlers = [...inn.overs, ...(inn.currentOver ? [inn.currentOver] : [])]
    .filter(o => { if (seen.has(o.bowler)) return false; seen.add(o.bowler); return true; })
    .map(o => o.bowler);
  if (!bowlers.length) return '';
  return `
    <div class="divider mt-sm"></div>
    <div class="text-xs text-2 mt-sm" style="font-weight:700;letter-spacing:0.5px">BOWLING</div>
    <table class="scorecard-table mt-sm">
      <thead><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th><th>Ext</th></tr></thead>
      <tbody>
        ${bowlers.map(name => {
          const s = getBowlerStats(inn, name);
          return `<tr>
            <td><div class="player-name">${esc(name)}</div></td>
            <td>${s.overStr}</td><td class="sc-runs">${s.runs}</td>
            <td>${s.wkts}</td><td>${s.extras}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ── Match Summary ─────────────────────────────────────────
function renderMatchSummary(match) {
  if (!match) return;
  const el = document.getElementById('summary-content');
  if (!el) return;

  let html = '';

  // Result banner
  if (match.result) {
    const r = match.result;
    const txt = r.marginType === 'tie'
      ? 'Match Tied!'
      : (r.winner + ' won by ' + r.margin + ' ' + r.marginType);
    html += `<div class="result-banner">${esc(txt)}</div>`;
  }

  // Each innings
  match.innings.forEach((inn, i) => {
    if (!inn) return;
    html += `<div class="card mt-md">
      <div class="section-head">${esc(inn.battingTeam)} — Innings ${i+1}</div>
      <div class="score-main text-primary" style="font-size:22px;color:var(--c-primary-mid);font-weight:900;margin:6px 0">
        ${inn.totalRuns}/${inn.wickets} <span style="font-size:13px;font-weight:600;color:var(--c-text-2)">(${getOverDisplay(inn)} ov)</span>
      </div>
      <table class="scorecard-table">
        <thead><tr><th>Batsman</th><th>R</th><th>B</th><th>4s</th><th>6s</th></tr></thead>
        <tbody>
          ${inn.batsmen.map(b => `
            <tr>
              <td><div class="player-name">${esc(b.name)}</div><div class="sc-out">${b.isOut ? esc(b.how) : 'not out'}</div></td>
              <td class="sc-runs">${b.runs}</td><td>${b.balls}</td><td>${b.fours}</td><td>${b.sixes}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="divider mt-sm"></div>
      <div class="text-sm text-2 mt-sm">
        Extras: ${totalExtras(inn)}
        (Wd ${inn.extras.wides}, NB ${inn.extras.noBalls}, B ${inn.extras.byes}, LB ${inn.extras.legByes})
      </div>
      ${renderBowlingTable(inn)}
    </div>`;
  });

  el.innerHTML = html;
}

// ── Rosters screen ───────────────────────────────────────
function renderRosters() {
  const el = document.getElementById('rosters-content');
  if (!el) return;
  const rosters = getAllRosters();
  const teams   = Object.keys(rosters);
  if (teams.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>No saved rosters yet.<br>Player names are saved automatically after a match.</p></div>';
    return;
  }
  let html = '';
  teams.forEach(team => {
    const players = rosters[team];
    if (!players.length) return;
    html += `<div class="card mb-md">
      <div class="section-head">${esc(team)}</div>
      <div class="roster-chips" id="chips-${safeid(team)}">
        ${players.map(p => `
          <div class="roster-chip">
            ${esc(p)}
            <button onclick="handleRemovePlayer('${esc(team)}','${esc(p)}')" aria-label="Remove">×</button>
          </div>`).join('')}
      </div>
    </div>`;
  });
  el.innerHTML = html || '<div class="empty-state"><div class="empty-icon">👤</div><p>No saved players.</p></div>';
}

// ── Over summary (end-of-over screen) ────────────────────
function renderOverSummary(match) {
  const inn = match.innings[match.currentInnings];
  const lastOver = inn.overs[inn.overs.length - 1];
  if (!lastOver) return;

  setEl('eos-over-num',    'Over ' + lastOver.overNumber + ' complete');
  setEl('eos-bowler-name', lastOver.bowler);
  setEl('eos-over-runs',   lastOver.runs + ' run' + (lastOver.runs !== 1 ? 's' : ''));
  setEl('eos-over-wkts',   lastOver.wickets + ' wicket' + (lastOver.wickets !== 1 ? 's' : ''));
  setEl('eos-bowler-fig',  getBowlerFigures(inn, lastOver.bowler));
  setEl('eos-total',       inn.totalRuns + '/' + inn.wickets + ' (' + getOverDisplay(inn) + ' ov)');

  renderBallDots(document.getElementById('eos-dots'), lastOver);

  // Populate bowling team for next bowler datalist
  const bowlingTeam = match.teams.find(t => t.name === inn.bowlingTeam);
  if (bowlingTeam) {
    populateDatalist('bowler-datalist', [
      ...bowlingTeam.bowlers,
      ...getRoster(bowlingTeam.name)
    ]);
  }

  // Recent bowlers chips (current innings only) — grey out last bowler and quota-reached bowlers
  const chipsEl = document.getElementById('eos-recent-bowlers');
  if (chipsEl) {
    const bowlerOvers = {};
    inn.overs.forEach(o => { bowlerOvers[o.bowler] = (bowlerOvers[o.bowler] || 0) + 1; });
    const names = Object.keys(bowlerOvers);
    const justBowled = lastOver.bowler;
    const maxOv = getMaxBowlerOvers(match.overs);
    chipsEl.innerHTML = names.length
      ? names.map(name => {
          const isJust  = name === justBowled;
          const isMaxed = bowlerOvers[name] >= maxOv;
          const disabled = isJust || isMaxed;
          const badge = isMaxed
            ? '<span class="chip-max">MAX</span>'
            : isJust ? '<span class="chip-max">JUST</span>' : '';
          return `<button class="eos-bowler-chip${disabled ? ' eos-chip-used' : ''}"
            type="button" ${disabled ? 'disabled' : `data-bowler="${esc(name)}"`}>
            ${esc(name)}<span class="chip-overs">${bowlerOvers[name]}ov</span>${badge}
          </button>`;
        }).join('')
      : '';
  }
}

// ── Innings break ─────────────────────────────────────────
function renderInningsBreak(match) {
  const inn1 = match.innings[0];
  const t2   = match.teams.find(t => t.name !== inn1.battingTeam);
  setEl('ib-score',  inn1.battingTeam + ' scored ' + inn1.totalRuns + '/' + inn1.wickets);
  setEl('ib-overs',  '(' + getOverDisplay(inn1) + ' overs)');
  setEl('ib-target', (t2 ? t2.name : 'Team 2') + ' need ' + getTarget(match) + ' to win');
}

// ── Helpers ──────────────────────────────────────────────
function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function safeid(s) { return s.replace(/[^a-zA-Z0-9]/g,'_'); }

function populateDatalist(id, names) {
  const dl = document.getElementById(id);
  if (!dl) return;
  const unique = [...new Set(names.filter(Boolean))].sort();
  dl.innerHTML = unique.map(n => `<option value="${esc(n)}">`).join('');
}

function showToast(msg, duration) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration || 2200);
}
