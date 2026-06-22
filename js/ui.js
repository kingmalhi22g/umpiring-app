// ui.js — DOM render helpers

// ── Ball dot ─────────────────────────────────────────────
function ballDotClass(delivery) {
  if (!delivery) return 'bd-dot';
  if (delivery.isWicket) {
    const wt = delivery.extras ? delivery.extras.type : null;
    return (wt === 'wide' || wt === 'no_ball') ? 'bd-w bd-wx' : 'bd-w';
  }
  const eType = delivery.extras ? delivery.extras.type : null;
  if (eType === 'wide')   return 'bd-wd';
  if (eType === 'no_ball') return 'bd-nb';
  if (eType === 'bye')    return 'bd-bye';
  if (eType === 'leg_bye') return 'bd-lb';
  if (eType === 'penalty') return 'bd-pen';
  if (delivery.runs === 6) return 'bd-6';
  if (delivery.runs === 4) return 'bd-4';
  if (delivery.runs > 0)  return 'bd-' + delivery.runs;
  return 'bd-dot';
}

function ballDotLabel(delivery) {
  if (!delivery) return '·';
  if (delivery.isWicket) {
    const eType = delivery.extras ? delivery.extras.type : null;
    const eRuns = delivery.extras ? (delivery.extras.runs || 0) : 0;
    if (eType === 'wide')    return (eRuns > 0 ? eRuns : '') + 'Wd+W';        // e.g. 1Wd+W
    if (eType === 'no_ball') return (delivery.runs > 0 ? delivery.runs : '') + 'NB+W'; // e.g. 1NB+W
    if (delivery.runs > 0 && !eType) return delivery.runs + 'W';
    return 'W';
  }
  const eType = delivery.extras ? delivery.extras.type : null;
  const eRuns = delivery.extras ? (delivery.extras.runs || 0) : 0;
  if (eType === 'wide')    return (eRuns > 0 ? eRuns : '') + 'Wd';            // e.g. 1Wd
  if (eType === 'no_ball') return (delivery.runs > 0 ? delivery.runs : '') + 'NB'; // e.g. 1NB
  if (eType === 'bye')     return 'B';
  if (eType === 'leg_bye') return 'LB';
  if (eType === 'penalty') return '+5';
  if (delivery.runs === 0) return '·';
  return String(delivery.runs);
}

function renderBallDots(containerEl, over, editable) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  if (!over) return;
  const deliveries = over.allDeliveries;
  if (deliveries.length === 0) {
    containerEl.innerHTML = '<span class="text-2 text-sm">No balls bowled yet</span>';
    return;
  }
  deliveries.forEach((d, i) => {
    const dot = document.createElement(editable ? 'button' : 'div');
    dot.className = 'ball-dot ' + ballDotClass(d) + (editable ? ' ball-dot-edit' : '');
    dot.textContent = ballDotLabel(d);
    if (editable) {
      dot.type = 'button';
      dot.dataset.idx = i;
      dot.setAttribute('aria-label', 'Edit ball ' + (i + 1));
    }
    containerEl.appendChild(dot);
  });
}

// ── Live match display ────────────────────────────────────
function renderLiveHeader(match) {
  if (!match) return;
  const inn = match.innings[match.currentInnings];
  if (!inn) return;

  const isSuper = match.currentInnings >= 2;
  setEl('live-score-team', inn.battingTeam);
  setEl('live-score-oppo', inn.bowlingTeam);
  setEl('live-score-runs', inn.totalRuns);
  setEl('live-score-wkts', inn.wickets);
  setEl('live-score-overs', getOverDisplay(inn));

  // Format · innings label (e.g. "T20 · 1ST INNINGS")
  const inningsName = isSuper ? 'SUPER OVER'
    : (match.currentInnings === 1 ? '2ND INNINGS' : '1ST INNINGS');
  setEl('live-format-label', formatLabel(effectiveOvers(match)).toUpperCase() + ' · ' + inningsName);

  // Team crests (single letter; circle colours come from CSS)
  setCrestLetter('live-bat-crest', inn.battingTeam);
  setCrestLetter('live-bowl-crest', inn.bowlingTeam);

  // Bowling team's status: their score if they've batted, else "yet to bat"
  const oppoInn = getTeamInnings(match, inn.bowlingTeam);
  const oppoEl = document.getElementById('live-oppo-status');
  if (oppoEl) {
    oppoEl.textContent = (oppoInn && (oppoInn.overs.length || oppoInn.totalRuns))
      ? (oppoInn.totalRuns + '-' + oppoInn.wickets) : 'yet to bat';
  }

  const ballsBowled = inn.overs.length * 6 + (inn.currentOver ? inn.currentOver.balls.length : 0);
  const crr = ballsBowled > 0 ? (inn.totalRuns / (ballsBowled / 6)).toFixed(2) : null;
  setEl('live-stat-crr', crr || '—');

  const pship = getPartnership(inn);
  setEl('live-stat-pship', pship.runs + ' (' + pship.balls + ')');

  // Runs (and wickets, if any) in the current over — shown above the ball-by-ball dots.
  setEl('live-over-runs', inn.currentOver ? inn.currentOver.runs : 0);
  const overWkts = inn.currentOver ? inn.currentOver.wickets : 0;
  setEl('live-over-wkts', '/' + overWkts);

  const chasing = match.currentInnings === 1 || match.currentInnings === 3;
  const target = chasing ? getTarget(match) : null;
  const show = (id, on) => { const e = document.getElementById(id); if (e) e.classList.toggle('hidden', !on); };

  // Projected final score (1st innings — at the current run rate).
  if (!chasing) {
    const totalBalls = effectiveOvers(match) * 6;
    setEl('live-stat-proj', ballsBowled > 0 ? Math.round(inn.totalRuns / ballsBowled * totalBalls) : inn.totalRuns);
  }

  // Stat slots (CRR + partnership show in both innings):
  //   1st innings: CRR · Proj · P'ship
  //   chasing:     CRR · P'ship · Need · RRR · Target
  show('stat-crr',    true);
  show('stat-proj',   !chasing);
  show('stat-pship',  true);
  show('stat-need',   !!target);
  show('stat-rrr',    !!target);
  show('stat-target', !!target);
  if (target) {
    const ballsLeft  = Math.max(0, effectiveOvers(match) * 6 - ballsBowled);
    const runsNeeded = Math.max(0, target - inn.totalRuns);
    const rrr        = ballsLeft > 0 ? (runsNeeded / (ballsLeft / 6)).toFixed(2) : '—';
    setEl('live-stat-need',   runsNeeded + ' in ' + ballsLeft);
    setEl('live-stat-rrr',    rrr);
    setEl('live-stat-target', target);
  }

  // Batsmen (CricClubs-style mini scorecard)
  fillBatRow('striker',    inn.batsmen[inn.strikerIdx]);
  fillBatRow('nonstriker', inn.batsmen[inn.nonStrikerIdx]);

  // Bowler (current) — compact O–M–R–W line
  if (inn.currentOver) {
    const bowler = inn.currentOver.bowler;
    setAvatar('live-bowler-av', bowler);
    setEl('live-bowler-name', bowler);
    setBowlerFig('live-bowler-fig', inn, bowler);
  }

  // Previous bowler (whoever just bowled the last completed over)
  const row2 = document.getElementById('live-bowler2');
  const prevOver = inn.overs.length ? inn.overs[inn.overs.length - 1] : null;
  const curBowler = inn.currentOver ? inn.currentOver.bowler : null;
  if (row2 && prevOver && prevOver.bowler && prevOver.bowler !== curBowler) {
    setAvatar('live-bowler2-av', prevOver.bowler);
    setEl('live-bowler2-name', prevOver.bowler);
    setBowlerFig('live-bowler2-fig', inn, prevOver.bowler);
    row2.classList.remove('hidden');
  } else if (row2) {
    row2.classList.add('hidden');
  }

  // Ball dots (tappable to edit)
  renderBallDots(document.getElementById('live-dots'), inn.currentOver, true);

  // Free hit badge
  const fhEl = document.getElementById('live-freehit');
  if (fhEl) fhEl.classList.toggle('hidden', !inn.freeHitNext);

  // Screen-reader announcement of the live score (the visual hero is
  // aria-hidden, so this single polite region carries the spoken update).
  const announceEl = document.getElementById('live-score-announce');
  if (announceEl) {
    let msg = inn.battingTeam + ' ' + inn.totalRuns + ' for ' + inn.wickets +
              ', ' + getOverDisplay(inn) + ' overs';
    if (target) msg += ', need ' + Math.max(0, target - inn.totalRuns) + ' to win';
    if (inn.freeHitNext) msg += '. Free hit';
    announceEl.textContent = msg;
  }
}

function setAvatar(id, name) {
  const e = document.getElementById(id);
  if (!e) return;
  e.style.background = avatarColor(String(name || '?'));
  e.textContent = initials(name, 2);
}

// Single-letter team crest (background gradient comes from CSS).
function setCrestLetter(id, name) {
  const e = document.getElementById(id);
  if (e) e.textContent = initials(name, 1);
}

// Bowler figure "O–M–R–W" + extras + economy, wickets highlighted.
function setBowlerFig(id, inn, bowler) {
  const e = document.getElementById(id);
  if (!e) return;
  const s = getBowlerStats(inn, bowler);
  const balls = oversToBalls(s.overStr);
  const econ = balls ? (s.runs / (balls / 6)).toFixed(2) : '0.00';
  e.innerHTML = esc(s.overStr) + '–' + s.maidens + '–' + s.runs +
                '–<span class="bowl-line-w">' + s.wkts + '</span>' +
                '<span class="bowl-line-x"> · ' + s.wides + 'wd ' + s.noBalls + 'nb · ' + econ + ' eco</span>';
}

// Last-5-(completed)-overs momentum bars, scaled to the busiest over.
function renderMomentum(inn) {
  const card = document.getElementById('live-momentum-card');
  const wrap = document.getElementById('live-momentum');
  if (!card || !wrap) return;
  const overs = inn.overs.slice(-5);
  if (overs.length === 0) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const runsArr = overs.map(o => o.runs || 0);
  const max = Math.max(1, ...runsArr);
  let totRuns = 0, totWkts = 0;
  wrap.innerHTML = overs.map(o => {
    const r = o.runs || 0;
    totRuns += r; totWkts += (o.wickets || 0);
    const pct = Math.max(8, Math.round(r / max * 100));
    const cls = r === max ? ' hot' : (r <= 2 ? ' cold' : '');
    return '<div class="mom-col"><div class="mom-bar' + cls + '" style="height:' + pct +
           '%"></div><span class="mom-val' + (r === max ? ' hot' : '') + '">' + r + '</span></div>';
  }).join('');
  const sum = document.getElementById('live-momentum-sum');
  if (sum) sum.textContent = totRuns + ' runs · ' + totWkts + ' wkt' + (totWkts === 1 ? '' : 's');
}

function fillBatRow(prefix, batsman) {
  const row = document.getElementById('live-' + prefix);
  if (!row) return;
  if (!batsman) { row.classList.add('hidden'); return; }
  row.classList.remove('hidden');
  setAvatar('live-' + prefix + '-av', batsman.name);
  setEl('live-' + prefix + '-name', batsman.name);
  setEl('live-' + prefix + '-r', batsman.runs);
  setEl('live-' + prefix + '-b', batsman.balls);
  setEl('live-' + prefix + '-4', batsman.fours);
  setEl('live-' + prefix + '-6', batsman.sixes);
  const srEl = document.getElementById('live-' + prefix + '-sr');
  if (srEl) {
    if (batsman.balls > 0) {
      const sr = Math.round(batsman.runs / batsman.balls * 100);
      srEl.innerHTML = srSvg(sr) + sr;
    } else {
      srEl.textContent = '—';
    }
  }
}

// ── Last-action confirmation ──────────────────────────────
function deliveryOutcomeText(d) {
  const e = d.extras || {}; const t = e.type;
  if (d.isWicket) return 'WICKET';
  if (t === 'wide')    return 'Wide'    + (e.runs ? ' +' + e.runs : '');
  if (t === 'no_ball') return 'No ball' + (d.runs ? ' +' + d.runs : '');
  if (t === 'bye')     return d.runs + ' bye' + (d.runs > 1 ? 's' : '');
  if (t === 'leg_bye') return d.runs + ' leg bye' + (d.runs > 1 ? 's' : '');
  if (d.runs === 4) return 'FOUR';
  if (d.runs === 6) return 'SIX';
  if (d.runs === 0) return 'Dot ball';
  return d.runs + ' run' + (d.runs > 1 ? 's' : '');
}

// Briefly confirm the ball just recorded, on the live screen.
function showLastAction(inn) {
  const el = document.getElementById('live-last-action');
  if (!el || !inn) return;
  const over = inn.currentOver;
  const d = over && over.allDeliveries.length ? over.allDeliveries[over.allDeliveries.length - 1] : null;
  if (!d) return;
  const who = d.batsman ? ' · ' + esc(d.batsman) : '';
  el.innerHTML = '<span class="la-tick">✓</span><span>' + esc(deliveryOutcomeText(d)) + who +
                 ' · ' + inn.totalRuns + '/' + inn.wickets + '</span>';
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1900);
}

// ── Redesign helpers ──────────────────────────────────────
function formatLabel(o) { return o === 10 ? 'T10' : o === 20 ? 'T20' : o === 50 ? 'ODI' : (o + ' ov'); }

function matchResultText(m) {
  const r = m.result;
  if (!r) return '';
  if (r.marginType === 'super over') return r.winner + ' won the Super Over';
  if (r.marginType === 'tie') return m.innings[2] ? 'Match Tied — Super Over also tied' : 'Match Tied';
  return r.winner + ' won by ' + r.margin + ' ' + r.marginType;
}

// First (non super-over) innings a team batted in, or null.
function getTeamInnings(m, name) {
  for (let i = 0; i < Math.min(2, m.innings.length); i++) {
    const inn = m.innings[i];
    if (inn && inn.battingTeam === name) return inn;
  }
  return null;
}

function chaseLine(m) {
  const inn = m.innings[m.currentInnings];
  if (!inn) return 'In progress';
  if (m.currentInnings === 1 || m.currentInnings === 3) {
    const t = getTarget(m);
    if (t) {
      const need = Math.max(0, t - inn.totalRuns);
      const bowled = inn.overs.length * 6 + (inn.currentOver ? inn.currentOver.balls.length : 0);
      const left = Math.max(0, effectiveOvers(m) * 6 - bowled);
      return inn.battingTeam + ' need ' + need + ' from ' + left;
    }
  }
  return inn.battingTeam + ' batting · ' + inn.totalRuns + '/' + inn.wickets;
}

function runRate(inn) {
  const balls = inn.overs.length * 6 + (inn.currentOver ? inn.currentOver.balls.length : 0);
  return balls ? (inn.totalRuns / (balls / 6)).toFixed(2) : '0.00';
}
function oversToBalls(str) { const p = String(str).split('.'); return (parseInt(p[0]) || 0) * 6 + (parseInt(p[1]) || 0); }

const AV_PALETTE = ['#C0392B','#1F6FB2','#6A4FB2','#2E8B57','#B2562E','#2E6FB2','#0E8C82','#E07B2E','#9C5BA6','#427D9D'];
function avatarColor(name) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_PALETTE[h % AV_PALETTE.length];
}
function initials(name, n) {
  const parts = String(name || '?').trim().split(/\s+/);
  let s = parts.slice(0, n).map(p => p[0]).join('');
  if (s.length < 2 && parts[0]) s = parts[0].slice(0, 2);
  return s.toUpperCase();
}
function avatarHtml(name, cls, size) {
  let style = 'background:' + avatarColor(String(name || '?'));
  if (size) style += ';width:' + size + 'px;height:' + size + 'px;font-size:' + (size < 32 ? 11 : 14) + 'px';
  return '<div class="' + cls + '" style="' + style + '">' + esc(initials(name, 2)) + '</div>';
}
function srSvg(sr) {
  return sr > 0
    ? '<svg viewBox="0 0 20 12"><path d="M1 11l5-6 4 3 9-7"/></svg>'
    : '<svg viewBox="0 0 20 12"><path d="M1 6h18"/></svg>';
}

// ── Match list (home) ─────────────────────────────────────
function renderMatchList(containerEl) {
  const mode = (typeof state !== 'undefined' && state.homeTab) ? state.homeTab : 'all';
  const idTime = id => Number(String(id).split('_')[1]) || 0;
  let matches;
  if (mode === 'mine') {
    // Only matches scored on this device (local storage).
    matches = getMatches().slice();
  } else {
    // Merge the shared cloud feed with local matches. Local wins for matches I
    // own (freshest while scoring); cloud supplies everyone else's matches.
    const byId = new Map();
    const cloud = (typeof state !== 'undefined' && state.cloudMatches) ? state.cloudMatches : [];
    cloud.forEach(m => byId.set(m.id, m));
    getMatches().forEach(m => byId.set(m.id, m));
    matches = [...byId.values()];
  }
  matches.sort((a, b) => idTime(b.id) - idTime(a.id));
  containerEl.innerHTML = '';
  if (matches.length === 0) {
    // First-ever launch: cloud feed hasn't arrived yet — show a loader, not "empty".
    const feedPending = typeof state !== 'undefined' && !state.cloudFeedLoaded;
    if (mode === 'all' && feedPending && typeof firebase !== 'undefined') {
      containerEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏏</div>
          <p>Loading matches…</p>
        </div>`;
      return;
    }
    const msg = mode === 'mine'
      ? 'No matches on this device yet.<br>Tap <strong>New Match</strong> to start.'
      : 'No matches yet.<br>Tap <strong>New Match</strong> to start.';
    containerEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏏</div>
        <p>${msg}</p>
      </div>`;
    return;
  }
  const scoreStr = inn => inn
    ? `${inn.totalRuns}/${inn.wickets} <span class="sum-tov">${getOverDisplay(inn)}</span>`
    : '<span class="sum-tov">—</span>';
  matches.forEach(m => {
    const div = document.createElement('div');
    div.className = 'match-item' + (m.status === 'in_progress' ? ' in-progress' : '');
    div.dataset.id = m.id;
    const t1 = m.teams[0], t2 = m.teams[1];
    const pill = m.result
      ? '<span class="sum-pill sum-pill-ok">Completed</span>'
      : m.status === 'in_progress'
        ? '<span class="sum-pill sum-pill-live"><span class="live-dot"></span>Live</span>'
        : '<span class="sum-pill sum-pill-setup">Setup</span>';
    let foot;
    if (m.result)                       foot = `<div class="mc-foot win">🏆 ${esc(matchResultText(m))}</div>`;
    else if (m.status === 'in_progress')foot = `<div class="mc-foot">${esc(chaseLine(m))}</div>`;
    else                                foot = `<div class="mc-foot">${esc(m.date || '')}${m.ground ? ' · ' + esc(m.ground) : ''}</div>`;
    div.innerHTML = `
      <div class="sum-rowb"><span class="sum-chip">${formatLabel(m.overs)}</span>${pill}</div>
      <div class="mc-team">${avatarHtml(t1.name,'sum-logo',30)}<span class="mc-name">${esc(t1.name)}</span><span class="mc-score">${scoreStr(getTeamInnings(m,t1.name))}</span></div>
      <div class="mc-team">${avatarHtml(t2.name,'sum-logo',30)}<span class="mc-name">${esc(t2.name)}</span><span class="mc-score">${scoreStr(getTeamInnings(m,t2.name))}</span></div>
      <div class="mc-footrow">
        ${foot}
        ${(typeof canEditMatch === 'function' ? canEditMatch(m) : true) ? `
        <button class="match-delete" data-del="${esc(m.id)}" type="button" aria-label="Delete match">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
        </button>` : ''}
      </div>`;
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

// ── Match Summary (redesigned: status card + tabs) ────────
function renderMatchSummary(match) {
  if (!match) return;
  const el = document.getElementById('summary-content');
  if (!el) return;

  const teams = match.teams;
  const pill = match.result
    ? '<span class="sum-pill sum-pill-ok">Completed</span>'
    : match.status === 'in_progress'
      ? '<span class="sum-pill sum-pill-live"><span class="live-dot"></span>Live</span>'
      : '<span class="sum-pill sum-pill-setup">Setup</span>';
  const scoreStr = inn => inn
    ? `${inn.totalRuns}/${inn.wickets} <span class="sum-tov">${getOverDisplay(inn)}</span>`
    : '<span class="sum-tov">yet to bat</span>';

  let resultHtml = '';
  if (match.result) {
    const isSuper = match.result.marginType === 'super over';
    resultHtml = `<div class="sum-result${isSuper ? ' is-super' : ''}">🏆 ${esc(matchResultText(match))}</div>`;
  }

  const card = `<div class="sum-card">
    <div class="sum-rowb"><span class="sum-chip">${formatLabel(match.overs)} · Match</span>${pill}</div>
    <div class="sum-sub">${esc(match.date || '')}${match.ground ? ' · ' + esc(match.ground) : ''}</div>
    <div class="sum-team">${avatarHtml(teams[0].name,'sum-logo')}<span class="sum-tname">${esc(teams[0].name)}</span><span class="sum-tscore">${scoreStr(getTeamInnings(match,teams[0].name))}</span></div>
    <div class="sum-team">${avatarHtml(teams[1].name,'sum-logo')}<span class="sum-tname">${esc(teams[1].name)}</span><span class="sum-tscore">${scoreStr(getTeamInnings(match,teams[1].name))}</span></div>
    ${resultHtml}
  </div>`;

  let superBtn = '';
  if (match.result && match.result.marginType === 'tie' && !match.innings[2]) {
    superBtn = `<button id="btn-super-over" class="btn btn-accent mt-md" type="button">&#9889; Start Super Over</button>`;
  }

  const tabs = `<div class="sc-tabs">
    <div class="sc-tab active" data-panel="scorecard">Scorecard</div>
    <div class="sc-tab" data-panel="summary">Summary</div>
    <div class="sc-tab" data-panel="commentary">Commentary</div>
  </div>`;

  const innList = match.innings.map((inn, i) => inn ? { inn, i } : null).filter(Boolean);
  const lastIdx = innList.length ? innList[innList.length - 1].i : 0;

  const scorecard = `<div class="sc-panel active" data-panel="scorecard">${
    innList.map(({ inn, i }) => renderInningsAccordion(match, inn, i, i === lastIdx)).join('')
  }</div>`;
  const summaryPanel = `<div class="sc-panel" data-panel="summary">${renderSummaryPanel(match, innList)}</div>`;
  const commentaryPanel = `<div class="sc-panel" data-panel="commentary">${renderCommentary(match, innList)}</div>`;

  el.innerHTML = card + superBtn + tabs + scorecard + summaryPanel + commentaryPanel;
}

function renderInningsAccordion(match, inn, i, open) {
  const label = i >= 2 ? (inn.battingTeam + ' · Super Over' + (i === 3 ? ' (Chase)' : '')) : inn.battingTeam;

  const bat = inn.batsmen.map(b => {
    const sr = b.balls > 0 ? (b.runs / b.balls * 100).toFixed(1) : '0.0';
    const dis = b.isOut ? esc(b.how || 'out') : 'not out';
    return `<div class="bt-row">
      <div class="bt-bp">${avatarHtml(b.name,'bt-av')}<div style="min-width:0">
        <div class="bt-name">${esc(b.name)}</div>
        <div class="bt-dis${b.isOut ? '' : ' notout'}">${dis}</div></div></div>
      <div class="bt-n bt-r">${b.runs}</div><div class="bt-n">${b.balls}</div>
      <div class="bt-n">${b.fours}</div><div class="bt-n">${b.sixes}</div>
      <div class="bt-sr">${srSvg(parseFloat(sr))}${sr}</div>
    </div>`;
  }).join('');

  const seen = new Set();
  const bowlers = [...inn.overs, ...(inn.currentOver ? [inn.currentOver] : [])]
    .filter(o => { if (seen.has(o.bowler)) return false; seen.add(o.bowler); return true; })
    .map(o => o.bowler);
  const bowl = bowlers.map(name => {
    const s = getBowlerStats(inn, name);
    const balls = oversToBalls(s.overStr);
    const econ = balls ? (s.runs / (balls / 6)).toFixed(1) : '0.0';
    return `<div class="bt-row bowl">
      <div class="bt-bp">${avatarHtml(name,'bt-av')}<div class="bt-name">${esc(name)}</div></div>
      <div class="bt-n">${s.overStr}</div><div class="bt-n">${s.maidens}</div><div class="bt-n bt-r">${s.runs}</div>
      <div class="bt-n">${s.wkts}</div><div class="bt-n">${econ}</div><div class="bt-n">${s.wides}</div><div class="bt-n">${s.noBalls}</div>
    </div>`;
  }).join('');

  return `<div class="inn-acc${open ? ' open' : ''}">
    <div class="inn-head">
      <span class="inn-nm">${esc(label)}</span>
      <span><span class="inn-sc">${inn.totalRuns}/${inn.wickets}</span>
        <span class="sum-tov">${getOverDisplay(inn)} ov</span>
        <svg class="inn-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span>
    </div>
    <div class="inn-body">
      <div class="bt-head"><span>Batsman</span><span>R</span><span>B</span><span>4s</span><span>6s</span><span>SR</span></div>
      ${bat}
      <div class="sum-extras"><span><b>Extras</b> ${totalExtras(inn)}</span>
        <span class="mut">wd ${inn.extras.wides} · nb ${inn.extras.noBalls} · b ${inn.extras.byes} · lb ${inn.extras.legByes}${inn.extras.penalties ? ' · pen ' + inn.extras.penalties : ''}</span></div>
      <div class="sum-total"><span>Total&nbsp;&nbsp;${inn.totalRuns}/${inn.wickets}</span><span class="rr">RR ${runRate(inn)}</span></div>
      ${bowl ? `<div class="bt-sec">Bowling</div>
        <div class="bt-head bowl"><span>Bowler</span><span>O</span><span>M</span><span>R</span><span>W</span><span>Econ</span><span>Wd</span><span>NB</span></div>${bowl}` : ''}
    </div>
  </div>`;
}

function renderSummaryPanel(match, innList) {
  let h = '';
  innList.forEach(({ inn, i }, idx) => {
    const label = i >= 2 ? (inn.battingTeam + ' · Super Over') : inn.battingTeam;

    // Top 3 batsmen by runs (then fewer balls).
    const topBats = inn.batsmen
      .filter(b => b.balls > 0 || b.runs > 0 || b.isOut)
      .sort((a, b) => (b.runs - a.runs) || (a.balls - b.balls))
      .slice(0, 3);

    // Top 3 bowlers by wickets (then fewer runs).
    const seen = new Set();
    const bowlers = [...inn.overs, ...(inn.currentOver ? [inn.currentOver] : [])]
      .filter(o => { if (seen.has(o.bowler)) return false; seen.add(o.bowler); return true; })
      .map(o => {
        const s = getBowlerStats(inn, o.bowler);
        const balls = oversToBalls(s.overStr);
        return { name: o.bowler, o: s.overStr, r: s.runs, w: s.wkts, econ: balls ? (s.runs / (balls / 6)).toFixed(1) : '0.0' };
      })
      .sort((a, b) => (b.w - a.w) || (a.r - b.r))
      .slice(0, 3);

    const batRows = topBats.length ? topBats.map(b => `
      <div class="perf-row">
        <div class="perf-name">${avatarHtml(b.name, 'bt-av')}<span>${esc(b.name)}${b.isOut ? '' : ' <span class="perf-no">*</span>'}</span></div>
        <div class="perf-val">${b.runs} <span class="perf-sub">(${b.balls})</span></div>
      </div>`).join('') : '<div class="perf-empty">No batting yet</div>';

    const bowlRows = bowlers.length ? bowlers.map(b => `
      <div class="perf-row">
        <div class="perf-name">${avatarHtml(b.name, 'bt-av')}<span>${esc(b.name)}</span></div>
        <div class="perf-val">${b.w}/${b.r} <span class="perf-sub">(${b.o} ov)</span></div>
      </div>`).join('') : '<div class="perf-empty">No bowling yet</div>';

    h += `<div class="inn-acc${idx === 0 ? ' open' : ''}">
      <div class="inn-head">
        <span class="inn-nm">${esc(label)}</span>
        <span><span class="inn-sc">${inn.totalRuns}/${inn.wickets}</span>
          <span class="sum-tov">${getOverDisplay(inn)} ov</span>
          <svg class="inn-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span>
      </div>
      <div class="inn-body">
        <div class="bt-sec">Top Batsmen</div>${batRows}
        <div class="bt-sec">Top Bowlers</div>${bowlRows}
        <div class="sum-total"><span>Total&nbsp;&nbsp;${inn.totalRuns}/${inn.wickets}</span><span class="rr">RR ${runRate(inn)}</span></div>
      </div>
    </div>`;
  });
  return h || '<div class="stat-block">No innings yet.</div>';
}

function renderStatsPanel(match, innList) {
  let h = '';
  innList.forEach(({ inn, i }) => {
    const fow = getFallOfWickets(inn);
    const pp = getPowerplayOvers(match.overs);
    const pps = getPowerplayStats(inn, pp);
    h += `<div class="stat-block"><h4>${esc(inn.battingTeam)}${i >= 2 ? ' · Super Over' : ''}</h4>`;
    if (pps && pps.played) h += `<div class="stat-line"><span>Powerplay (ov 1-${pp})</span><b>${pps.runs}/${pps.wkts}</b></div>`;
    if (fow.length) {
      h += fow.map(f => `<div class="stat-line"><span>Wkt ${f.num} — <b>${f.score}</b></span><span class="text-2">${esc(f.batsman)} · ${f.over} ov</span></div>`).join('');
    } else {
      h += `<div class="stat-line"><span>Fall of wickets</span><span class="text-2">none</span></div>`;
    }
    h += `</div>`;
  });
  return h || '<div class="stat-block">No stats yet.</div>';
}

// ── Over summary (end-of-over screen) ────────────────────
function renderOverSummary(match) {
  const inn = match.innings[match.currentInnings];
  const lastOver = inn.overs[inn.overs.length - 1];
  if (!lastOver) return;

  setEl('eos-over-num',    'End of Over ' + lastOver.overNumber);
  setEl('eos-bowler-name', lastOver.bowler);
  setEl('eos-over-runs',   lastOver.runs);
  setEl('eos-over-wkts',   lastOver.wickets);
  setEl('eos-bowler-fig',  getBowlerFigures(inn, lastOver.bowler));
  setEl('eos-total',       inn.battingTeam + ' · ' + inn.totalRuns + '-' + inn.wickets);

  renderBallDots(document.getElementById('eos-dots'), lastOver);

  // Recent bowlers chips (current innings only) — grey out last bowler and quota-reached bowlers
  const chipsEl = document.getElementById('eos-recent-bowlers');
  const maxOv = getMaxBowlerOvers(match.overs);
  const justBowled = lastOver.bowler;
  const suggested = suggestNextBowler(inn, maxOv);

  if (chipsEl) {
    const bowlerOvers = {};
    inn.overs.forEach(o => { bowlerOvers[o.bowler] = (bowlerOvers[o.bowler] || 0) + 1; });
    const names = Object.keys(bowlerOvers);
    chipsEl.innerHTML = names.length
      ? names.map(name => {
          const isJust  = name === justBowled;
          const isMaxed = bowlerOvers[name] >= maxOv;
          const disabled = isJust || isMaxed;
          const isSugg = !disabled && name === suggested;
          const badge = isMaxed
            ? '<span class="chip-max">MAX</span>'
            : isJust ? '<span class="chip-just">JUST</span>'
            : isSugg ? '<span class="chip-sugg">✨</span>' : '';
          return `<button class="eos-bowler-chip${disabled ? ' eos-chip-used' : ''}${isSugg ? ' eos-chip-sugg' : ''}"
            type="button" ${disabled ? 'disabled' : `data-bowler="${esc(name)}"`}>
            ${esc(name)}<span class="chip-overs">${bowlerOvers[name]}ov</span>${badge}
          </button>`;
        }).join('')
      : '';
  }

  // Pre-fill the next-bowler field with the suggestion (umpire usually just taps Continue).
  const inp = document.getElementById('eos-next-bowler');
  if (inp && suggested && !inp.value) inp.value = suggested;
}

// Likely next bowler: someone off-quota who didn't just bowl. Prefer the
// bowler from 2 overs ago (natural alternation), else the one with fewest overs.
function suggestNextBowler(inn, maxOv) {
  const overs = inn.overs;
  if (!overs.length) return '';
  const last = overs[overs.length - 1].bowler;
  const count = {};
  overs.forEach(o => { count[o.bowler] = (count[o.bowler] || 0) + 1; });
  if (overs.length >= 2) {
    const twoAgo = overs[overs.length - 2].bowler;
    if (twoAgo !== last && count[twoAgo] < maxOv) return twoAgo;
  }
  const avail = Object.keys(count).filter(b => b !== last && count[b] < maxOv);
  if (!avail.length) return '';
  avail.sort((a, b) => count[a] - count[b]);
  return avail[0];
}

// ── Innings break ─────────────────────────────────────────
function renderInningsBreak(match) {
  const inn1 = match.innings[0];
  const t2   = match.teams.find(t => t.name !== inn1.battingTeam);
  const target = getTarget(match);
  const oversN = effectiveOvers(match);
  const rpo = oversN ? (target / oversN).toFixed(2) : '—';
  setAvatar('ib-team-crest', inn1.battingTeam);
  setEl('ib-team-name', inn1.battingTeam);
  const big = document.getElementById('ib-bignum');
  if (big) big.innerHTML = inn1.totalRuns + '<span class="wk">-' + inn1.wickets + '</span>';
  setEl('ib-overs', getOverDisplay(inn1) + ' overs · RR ' + runRate(inn1));
  setEl('ib-need-line', (t2 ? t2.name : 'Team 2') + ' need');
  setEl('ib-target-num', target);
  setEl('ib-row-target', target);
  setEl('ib-row-overs', oversN);
  setEl('ib-row-rpo', rpo);
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

// ── Live Stats modal ─────────────────────────────────────
// ── Ball-by-ball commentary ──────────────────────────────
// Verbose description of one delivery, e.g. "Sid S to Shiva K, 1 run".
function commentaryOutcome(d) {
  const eType = d.extras ? d.extras.type : null;
  const eRuns = d.extras ? (d.extras.runs || 0) : 0;
  if (eType === 'penalty') return '5 penalty runs';
  const plural = n => n + ' run' + (n === 1 ? '' : 's');
  if (d.isWicket) {
    const how = d.wicket ? (d.wicket.type || 'out').replace(/_/g, ' ') : 'out';
    const pre = eType === 'wide' ? 'wide, ' : eType === 'no_ball' ? 'no ball, ' : '';
    const who = d.wicket && d.wicket.batsmanOut ? ' (' + d.wicket.batsmanOut + ')' : '';
    return pre + 'OUT! ' + how + who;
  }
  if (eType === 'wide')    return 'wide' + (eRuns > 0 ? ' + ' + plural(eRuns) : '');
  if (eType === 'no_ball') return 'no ball' + (d.runs > 0 ? ' + ' + plural(d.runs) : '');
  if (eType === 'bye')     return d.runs + ' bye' + (d.runs === 1 ? '' : 's');
  if (eType === 'leg_bye') return d.runs + ' leg bye' + (d.runs === 1 ? '' : 's');
  if (d.runs === 0) return 'no run';
  if (d.runs === 4) return 'FOUR';
  if (d.runs === 6) return 'SIX';
  return plural(d.runs);
}

function renderInningsCommentary(match, inn) {
  const allOvers = [...inn.overs, ...(inn.currentOver ? [inn.currentOver] : [])];
  if (!allOvers.length || allOvers.every(o => o.allDeliveries.length === 0)) {
    return '<div class="cm-empty">No balls bowled yet.</div>';
  }
  // Cumulative score + run-rate after each over, for the over-summary banners.
  let runs = 0, wkts = 0, balls = 0;
  const snap = allOvers.map(o => {
    runs += o.runs; wkts += o.wickets; balls += o.balls.length;
    return { runs, wkts, rr: balls > 0 ? (runs / (balls / 6)).toFixed(2) : '0.00' };
  });

  let h = `<div class="cm-inn-head">${esc(inn.battingTeam)} — ${inn.totalRuns}/${inn.wickets} <span class="cm-inn-ov">(${getOverDisplay(inn)} ov)</span></div>`;

  for (let oi = allOvers.length - 1; oi >= 0; oi--) {
    const o = allOvers[oi];
    const isCurrent = inn.currentOver && o === inn.currentOver;
    const dispOver = o.overNumber - 1;

    // Ball labels (extras don't advance the legal-ball count).
    let legal = 0;
    const labels = o.allDeliveries.map(d => {
      const isLegal = !(d.extras && (d.extras.type === 'wide' || d.extras.type === 'no_ball' || d.extras.type === 'penalty'))
        && !(d.isWicket && d.wicket && d.wicket.type === 'mankad');
      if (isLegal) legal++;
      return dispOver + '.' + (isLegal ? legal : legal + 1);
    });

    let rows = '';
    for (let di = o.allDeliveries.length - 1; di >= 0; di--) {
      const d = o.allDeliveries[di];
      rows += `<div class="cm-row">
        <span class="ball-dot ${ballDotClass(d)} cm-badge">${ballDotLabel(d)}</span>
        <div class="cm-text"><span class="cm-num">${labels[di]}</span>
          <span class="cm-line">${esc(o.bowler)} to ${esc(d.batsman || 'Batsman')}, ${esc(commentaryOutcome(d))}</span></div>
      </div>`;
    }

    const seq = o.allDeliveries.map(d => ballDotLabel(d)).join(' ');
    const sn = snap[oi];
    if (isCurrent) {
      h += `<div class="cm-over cm-over-live"><span class="cm-over-n">Over ${o.overNumber}</span><span class="cm-seq">${seq || '—'}</span></div>${rows}`;
    } else {
      h += `<div class="cm-over">
        <div class="cm-over-top"><span class="cm-over-n">Over ${o.overNumber}</span><span class="cm-seq">${seq}</span></div>
        <div class="cm-over-bot"><span>${o.runs} run${o.runs === 1 ? '' : 's'}${o.wickets ? ' · ' + o.wickets + 'w' : ''}</span><span>${esc(inn.battingTeam)} ${sn.runs}/${sn.wkts} · RR ${sn.rr}</span></div>
      </div>${rows}`;
    }
  }
  return h;
}

// Commentary for the whole match (latest innings first) — used on the summary.
function renderCommentary(match, innList) {
  if (!innList || !innList.length) return '<div class="cm-empty">No commentary yet.</div>';
  return innList.slice().reverse()
    .map(({ inn }) => renderInningsCommentary(match, inn))
    .join('<div class="cm-divider"></div>');
}

function renderStatsModal(match) {
  const el = document.getElementById('stats-content');
  if (!el || !match) return;
  const inn = match.innings[match.currentInnings];
  if (!inn) return;

  // Batting table
  const batRows = inn.batsmen.map((b, i) => {
    const isStriker = i === inn.strikerIdx && !b.isOut;
    const sr = b.balls > 0 ? (b.runs / b.balls * 100).toFixed(0) : '—';
    return `<tr${isStriker ? ' class="sc-active"' : ''}>
      <td><div class="player-name">${esc(b.name)}${isStriker ? ' <span class="sc-strike">on strike</span>' : ''}</div>
          <div class="sc-out">${b.isOut ? esc(b.how) : 'batting'}</div></td>
      <td class="sc-runs">${b.runs}</td><td>${b.balls}</td>
      <td>${b.fours}</td><td>${b.sixes}</td><td>${sr}</td>
    </tr>`;
  }).join('');

  // Bowling table
  const seen = new Set();
  const bowlers = [...inn.overs, ...(inn.currentOver ? [inn.currentOver] : [])]
    .filter(o => { if (seen.has(o.bowler)) return false; seen.add(o.bowler); return true; })
    .map(o => o.bowler);

  const bowlRows = bowlers.map(name => {
    const s = getBowlerStats(inn, name);
    const balls = s.completedOvers * 6 + s.inOver;
    const econ = balls > 0 ? (s.runs / (balls / 6)).toFixed(1) : '—';
    const isCurrent = inn.currentOver && inn.currentOver.bowler === name;
    return `<tr${isCurrent ? ' class="sc-active"' : ''}>
      <td><div class="player-name">${esc(name)}${isCurrent ? ' <span class="sc-strike">bowling</span>' : ''}</div></td>
      <td>${s.overStr}</td><td>${s.maidens}</td><td>${s.runs}</td><td>${s.wkts}</td><td>${econ}</td><td>${s.wides}</td><td>${s.noBalls}</td>
    </tr>`;
  }).join('');

  const ballsBowled = inn.overs.length * 6 + (inn.currentOver ? inn.currentOver.balls.length : 0);
  const crr = ballsBowled > 0 ? (inn.totalRuns / (ballsBowled / 6)).toFixed(2) : '—';

  // Fall of wickets
  const fow = getFallOfWickets(inn);
  const fowHtml = fow.length ? `
    <div class="divider mt-sm"></div>
    <div class="section-head mt-sm">FALL OF WICKETS</div>
    <div class="fow-list">
      ${fow.map(f => `<div class="fow-item">
        <span class="fow-score">${f.num}&ndash;${f.score}</span>
        <span class="fow-bat">${esc(f.batsman)}</span>
        <span class="fow-over">${f.over} ov</span>
      </div>`).join('')}
    </div>` : '';

  el.innerHTML = `
    <div class="sc-tabs">
      <div class="sc-tab active" data-panel="board">Scoreboard</div>
      <div class="sc-tab" data-panel="commentary">Commentary</div>
    </div>
    <div class="sc-panel active" data-panel="board">
    <div class="stats-hero">
      <div class="stats-hero-team">${esc(inn.battingTeam)}</div>
      <div class="stats-hero-score">${inn.totalRuns}<span>/${inn.wickets}</span></div>
      <div class="stats-hero-meta">${getOverDisplay(inn)} overs &middot; CRR ${crr}</div>
    </div>
    <div class="section-head">BATTING — ${esc(inn.battingTeam)}</div>
    <table class="scorecard-table mt-sm">
      <thead><tr><th>Batsman</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
      <tbody>${batRows}</tbody>
    </table>
    <div class="text-xs text-2 mt-sm">
      Extras: ${totalExtras(inn)}
      (Wd ${inn.extras.wides}, NB ${inn.extras.noBalls}, B ${inn.extras.byes}, LB ${inn.extras.legByes}${inn.extras.penalties ? ', Pen ' + inn.extras.penalties : ''})
    </div>
    ${bowlRows ? `
    <div class="divider mt-sm"></div>
    <div class="section-head mt-sm">BOWLING — ${esc(inn.bowlingTeam)}</div>
    <table class="scorecard-table mt-sm">
      <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th><th>Wd</th><th>NB</th></tr></thead>
      <tbody>${bowlRows}</tbody>
    </table>` : ''}
    ${fowHtml}
    </div>
    <div class="sc-panel" data-panel="commentary">${renderInningsCommentary(match, inn)}</div>
  `;
}

// ── Scorecard export card ─────────────────────────────────
function renderExportCard(match) {
  if (!match) return;
  const t1 = match.teams[0].name, t2 = match.teams[1].name;
  setEl('ec-title', `${t1} vs ${t2}`);
  setEl('ec-meta', `${match.date}${match.ground ? ' · ' + match.ground : ''} · ${match.overs} overs`);

  let body = '';
  match.innings.forEach((inn, i) => {
    if (!inn) return;
    const batRows = inn.batsmen.map(b => `
      <tr>
        <td style="padding:5px 4px"><strong>${esc(b.name)}</strong><br>
          <span style="font-size:10px;color:#5C6B7A">${b.isOut ? esc(b.how) : 'not out'}</span></td>
        <td style="padding:5px 4px;font-weight:700;text-align:center">${b.runs}</td>
        <td style="padding:5px 4px;text-align:center">${b.balls}</td>
        <td style="padding:5px 4px;text-align:center">${b.fours}</td>
        <td style="padding:5px 4px;text-align:center">${b.sixes}</td>
      </tr>`).join('');

    const seen = new Set();
    const bowlers = [...inn.overs, ...(inn.currentOver ? [inn.currentOver] : [])]
      .filter(o => { if (seen.has(o.bowler)) return false; seen.add(o.bowler); return true; })
      .map(o => o.bowler);
    const bowlRows = bowlers.map(name => {
      const s = getBowlerStats(inn, name);
      return `<tr>
        <td style="padding:5px 4px"><strong>${esc(name)}</strong></td>
        <td style="padding:5px 4px;text-align:center">${s.overStr}</td>
        <td style="padding:5px 4px;font-weight:700;text-align:center">${s.runs}</td>
        <td style="padding:5px 4px;text-align:center">${s.wkts}</td>
      </tr>`;
    }).join('');

    body += `
      <div style="margin-bottom:16px">
        <div style="background:#0A1B2E;color:#fff;border-left:4px solid #2BD4D4;padding:8px 12px;border-radius:6px 6px 0 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">
          ${esc(inn.battingTeam)} — ${i >= 2 ? 'Super Over' + (i === 3 ? ' (Chase)' : '') : 'Innings ' + (i + 1)}
        </div>
        <div style="background:#fff;border-radius:0 0 6px 6px;overflow:hidden">
          <div style="padding:10px 12px">
            <span style="font-size:28px;font-weight:900;color:#16314A">${inn.totalRuns}/${inn.wickets}</span>
            <span style="font-size:13px;color:#5C6B7A;margin-left:6px">(${getOverDisplay(inn)} ov)</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:#E3EAF2">
              <th style="padding:5px 4px;text-align:left;font-size:10px;color:#5C6B7A;text-transform:uppercase">Batsman</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#5C6B7A">R</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#5C6B7A">B</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#5C6B7A">4s</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#5C6B7A">6s</th>
            </tr></thead>
            <tbody>${batRows}</tbody>
          </table>
          <div style="padding:6px 12px;font-size:11px;color:#5C6B7A;border-top:1px solid #D7E0EA">
            Extras: ${totalExtras(inn)} (Wd ${inn.extras.wides}, NB ${inn.extras.noBalls}, B ${inn.extras.byes}, LB ${inn.extras.legByes}${inn.extras.penalties ? ', Pen ' + inn.extras.penalties : ''})
          </div>
          ${(() => {
            const fow = getFallOfWickets(inn);
            if (!fow.length) return '';
            return `<div style="padding:6px 12px;font-size:11px;color:#5C6B7A;border-top:1px solid #D7E0EA">
              <strong style="color:#0F7A88">Fall:</strong> ${fow.map(f => `${f.num}-${f.score} (${esc(f.batsman)}, ${f.over})`).join(' &nbsp; ')}
            </div>`;
          })()}
          ${(() => {
            const pp = getPowerplayOvers(match.overs);
            const pps = getPowerplayStats(inn, pp);
            if (!pps.played) return '';
            return `<div style="padding:6px 12px;font-size:11px;color:#5C6B7A;border-top:1px solid #D7E0EA">
              <strong style="color:#0F7A88">Powerplay</strong> (ov 1-${pp}): ${pps.runs}/${pps.wkts}
            </div>`;
          })()}
          ${bowlRows ? `
          <table style="width:100%;border-collapse:collapse;font-size:12px;border-top:2px solid #D7E0EA">
            <thead><tr style="background:#E3EAF2">
              <th style="padding:5px 4px;text-align:left;font-size:10px;color:#5C6B7A;text-transform:uppercase">Bowler</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#5C6B7A">O</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#5C6B7A">R</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#5C6B7A">W</th>
            </tr></thead>
            <tbody>${bowlRows}</tbody>
          </table>` : ''}
        </div>
      </div>`;
  });

  if (match.result) {
    const r = match.result;
    const txt = r.marginType === 'super over' ? `${esc(r.winner)} won the Super Over`
      : r.marginType === 'tie' ? (match.innings[2] ? 'Match Tied — Super Over also tied!' : 'Match Tied!')
      : `${esc(r.winner)} won by ${r.margin} ${r.marginType}`;
    body += `<div style="background:#FFC24B;color:#0A1B2E;padding:12px;border-radius:6px;text-align:center;font-weight:900;font-size:16px">${txt}</div>`;
  }

  body += `<div style="text-align:center;padding:12px 0 4px;font-size:10px;color:#8A98A6">Made with ScoringBook</div>`;

  const ecBody = document.getElementById('ec-body');
  if (ecBody) ecBody.innerHTML = body;
}

// ── Over-by-over umpiring sheet (shareable image) ─────────
// One ball's shorthand for the "Over Analysis" column.
function deliverySymbol(d) {
  const e = d.extras || {};
  const t = e.type;
  if (t === 'wide')    return 'Wd' + (e.runs ? '+' + e.runs : '');
  if (t === 'no_ball') return 'Nb' + (d.runs ? '+' + d.runs : '');
  if (t === 'bye')     return 'B' + d.runs;
  if (t === 'leg_bye') return 'Lb' + d.runs;
  if (d.isWicket)      return d.runs ? d.runs + '+W' : 'W';
  return d.runs === 0 ? '•' : String(d.runs);
}

function renderOverSheet(match) {
  const el = document.getElementById('oversheet-body');
  if (!el || !match) return;
  const th = 'padding:5px 6px;border:1px solid #C9D4DF;font-size:11px;text-transform:uppercase;background:#16314A;color:#fff;font-weight:800';
  const td = 'padding:5px 6px;border:1px solid #C9D4DF;font-size:12px;color:#15212E';
  let html = '';

  match.innings.forEach((inn, idx) => {
    if (!inn) return;
    const overs = [...inn.overs, ...(inn.currentOver && inn.currentOver.allDeliveries.length ? [inn.currentOver] : [])];
    let cumR = 0, cumW = 0;
    const rows = overs.map(ov => {
      cumR += ov.runs; cumW += ov.wickets;
      const balls = ov.allDeliveries.map(d => {
        const s = deliverySymbol(d);
        const wkt = d.isWicket;
        return `<span style="display:inline-block;min-width:18px;text-align:center;margin:1px 2px;padding:1px 3px;border-radius:3px;font-size:11px;font-weight:700;${wkt?'background:#E2453B;color:#fff':'background:#E3EAF2;color:#15212E'}">${esc(s)}</span>`;
      }).join('');
      return `<tr>
        <td style="${td};text-align:center;font-weight:800">${ov.overNumber}</td>
        <td style="${td}">${esc(ov.bowler)}</td>
        <td style="${td}">${balls}</td>
        <td style="${td};text-align:center;font-weight:800">${ov.runs}</td>
        <td style="${td};text-align:center;color:#E2453B;font-weight:800">${ov.wickets || ''}</td>
        <td style="${td};text-align:center;font-weight:800">${cumR}/${cumW}</td>
      </tr>`;
    }).join('');

    const label = idx >= 2 ? 'Super Over' : 'Innings ' + (idx + 1);
    html += `<div style="padding:${idx ? '22' : '18'}px 18px 0">
      <div style="text-align:center;border-bottom:2px solid #16314A;padding-bottom:8px;margin-bottom:10px">
        <div style="font-size:10px;letter-spacing:2px;color:#0F7A88;font-weight:800;text-transform:uppercase">ScoringBook</div>
        <div style="font-size:16px;font-weight:900;letter-spacing:.5px;color:#15212E;margin-top:2px">UMPIRING SCORING SHEET</div>
        <div style="font-size:13px;font-weight:700;color:#16314A;margin-top:3px">${esc(inn.battingTeam)} &mdash; ${label}</div>
        <div style="font-size:11px;color:#5C6B7A;margin-top:2px">
          Bowling: ${esc(inn.bowlingTeam)}${match.date ? ' &middot; ' + esc(match.date) : ''}${match.ground ? ' &middot; ' + esc(match.ground) : ''}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        <thead><tr>
          <th style="${th};width:44px">Over</th>
          <th style="${th};width:110px">Bowler</th>
          <th style="${th}">Over Analysis</th>
          <th style="${th};width:50px">Runs</th>
          <th style="${th};width:46px">Wkts</th>
          <th style="${th};width:70px">Total</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="6" style="${td};text-align:center;color:#8A98A6">No overs bowled</td></tr>`}</tbody>
        <tfoot><tr>
          <td colspan="3" style="${td};text-align:right;font-weight:800;background:#E3EAF2">FINAL SCORE</td>
          <td colspan="3" style="${td};text-align:center;font-weight:900;background:#E3EAF2">${inn.totalRuns}/${inn.wickets} (${getOverDisplay(inn)} ov)</td>
        </tr></tfoot>
      </table>
    </div>`;
  });

  html += `<div style="text-align:center;padding:14px 0 16px;font-size:10px;color:#8A98A6">Made with ScoringBook</div>`;
  el.innerHTML = html;
}

function showToast(msg, duration) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration || 2200);
}
