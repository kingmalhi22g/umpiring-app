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
  if (delivery.isWicket) {
    const eType = delivery.extras ? delivery.extras.type : null;
    if (delivery.runs > 0 && !eType) return delivery.runs + 'W';
    return 'W';
  }
  const eType = delivery.extras ? delivery.extras.type : null;
  const eRuns = delivery.extras ? (delivery.extras.runs || 0) : 0;
  if (eType === 'wide')    return eRuns > 0 ? 'Wd+' + eRuns : 'Wd';
  if (eType === 'no_ball') return delivery.runs > 0 ? 'NB+' + delivery.runs : 'NB';
  if (eType === 'bye')     return 'B';
  if (eType === 'leg_bye') return 'LB';
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
  setEl('live-score-team', (isSuper ? 'Super Over · ' : '') + inn.battingTeam);
  setEl('live-score-runs', inn.totalRuns);
  setEl('live-score-wkts', inn.wickets);
  setEl('live-score-overs', getOverDisplay(inn) + ' ov');

  const ballsBowled = inn.overs.length * 6 + (inn.currentOver ? inn.currentOver.balls.length : 0);
  const crr = ballsBowled > 0 ? (inn.totalRuns / (ballsBowled / 6)).toFixed(2) : null;
  setEl('live-stat-crr', crr || '—');

  const pship = getPartnership(inn);
  setEl('live-stat-pship', pship.runs + ' (' + pship.balls + ')');

  const chasing = match.currentInnings === 1 || match.currentInnings === 3;
  const target = chasing ? getTarget(match) : null;
  const needEl   = document.getElementById('stat-need');
  const rrrEl    = document.getElementById('stat-rrr');
  const targetEl = document.getElementById('stat-target');
  const pshipEl  = document.getElementById('stat-pship');
  // When chasing, surface Need/RRR/Target instead of partnership.
  if (pshipEl) pshipEl.classList.toggle('hidden', !!target);
  if (target) {
    const ballsLeft  = Math.max(0, effectiveOvers(match) * 6 - ballsBowled);
    const runsNeeded = Math.max(0, target - inn.totalRuns);
    const rrr        = ballsLeft > 0 ? (runsNeeded / (ballsLeft / 6)).toFixed(2) : '—';
    setEl('live-stat-need',   runsNeeded + ' in ' + ballsLeft);
    setEl('live-stat-rrr',    rrr);
    setEl('live-stat-target', target);
    if (needEl)   needEl.classList.remove('hidden');
    if (rrrEl)    rrrEl.classList.remove('hidden');
    if (targetEl) targetEl.classList.remove('hidden');
  } else {
    if (needEl)   needEl.classList.add('hidden');
    if (rrrEl)    rrrEl.classList.add('hidden');
    if (targetEl) targetEl.classList.add('hidden');
  }

  // Batsmen (CricClubs-style mini scorecard)
  fillBatRow('striker',    inn.batsmen[inn.strikerIdx]);
  fillBatRow('nonstriker', inn.batsmen[inn.nonStrikerIdx]);

  // Bowler
  if (inn.currentOver) {
    const bowler = inn.currentOver.bowler;
    const bs = getBowlerStats(inn, bowler);
    const balls = oversToBalls(bs.overStr);
    const econ = balls ? (bs.runs / (balls / 6)).toFixed(1) : '0.0';
    setAvatar('live-bowler-av', bowler);
    setEl('live-bowler-name', bowler);
    setEl('live-bowler-o',   bs.overStr);
    setEl('live-bowler-r',   bs.runs);
    setEl('live-bowler-w',   bs.wkts);
    setEl('live-bowler-econ', econ);
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
      ${foot}
      <button class="match-delete" data-del="${esc(m.id)}" type="button" aria-label="Delete match">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
      </button>`;
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
    <div class="sc-tab" data-panel="stats">Stats</div>
  </div>`;

  const innList = match.innings.map((inn, i) => inn ? { inn, i } : null).filter(Boolean);
  const lastIdx = innList.length ? innList[innList.length - 1].i : 0;

  const scorecard = `<div class="sc-panel active" data-panel="scorecard">${
    innList.map(({ inn, i }) => renderInningsAccordion(match, inn, i, i === lastIdx)).join('')
  }</div>`;
  const summaryPanel = `<div class="sc-panel" data-panel="summary">${renderSummaryPanel(match, innList)}</div>`;
  const statsPanel   = `<div class="sc-panel" data-panel="stats">${renderStatsPanel(match, innList)}</div>`;

  el.innerHTML = card + superBtn + tabs + scorecard + summaryPanel + statsPanel;
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
      <div class="bt-n">${s.overStr}</div><div class="bt-n bt-r">${s.runs}</div>
      <div class="bt-n">${s.wkts}</div><div class="bt-n">${econ}</div>
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
        <span class="mut">wd ${inn.extras.wides} · nb ${inn.extras.noBalls} · b ${inn.extras.byes} · lb ${inn.extras.legByes}</span></div>
      <div class="sum-total"><span>Total&nbsp;&nbsp;${inn.totalRuns}/${inn.wickets}</span><span class="rr">RR ${runRate(inn)}</span></div>
      ${bowl ? `<div class="bt-sec">Bowling</div>
        <div class="bt-head bowl"><span>Bowler</span><span>O</span><span>R</span><span>W</span><span>Econ</span></div>${bowl}` : ''}
    </div>
  </div>`;
}

function renderSummaryPanel(match, innList) {
  let h = '';
  if (match.result) {
    const isSuper = match.result.marginType === 'super over';
    h += `<div class="sum-result${isSuper ? ' is-super' : ''}" style="margin-top:12px">🏆 ${esc(matchResultText(match))}</div>`;
  }
  innList.forEach(({ inn, i }) => {
    const top = [...inn.batsmen].sort((a, b) => b.runs - a.runs)[0];
    h += `<div class="stat-block"><h4>${esc(inn.battingTeam)}${i >= 2 ? ' · Super Over' : ''}</h4>
      <div class="stat-line"><span>Score</span><b>${inn.totalRuns}/${inn.wickets} (${getOverDisplay(inn)} ov)</b></div>
      <div class="stat-line"><span>Run rate</span><b>${runRate(inn)}</b></div>
      ${top ? `<div class="stat-line"><span>Top scorer</span><b>${esc(top.name)} — ${top.runs} (${top.balls})</b></div>` : ''}
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
            : isJust ? '<span class="chip-just">JUST</span>' : '';
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

// ── Live Stats modal ─────────────────────────────────────
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
      <td>${s.overStr}</td><td>${s.runs}</td><td>${s.wkts}</td><td>${econ}</td>
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

  // Powerplay strip
  const pp  = getPowerplayOvers(match.overs);
  const pps = getPowerplayStats(inn, pp);
  const ppHtml = `
    <div class="divider mt-sm"></div>
    <div class="section-head mt-sm">POWERPLAY</div>
    <div class="pp-strip">
      ${Array.from({ length: match.overs }, (_, i) => i + 1).map(n =>
        `<span class="pp-over${n <= pp ? ' pp' : ''}${n === pps.played && inn.currentOver ? ' pp-current' : ''}">${n}</span>`
      ).join('')}
    </div>
    <div class="pp-legend">Overs 1&ndash;${pp} &middot; scored <strong>${pps.runs}/${pps.wkts}</strong></div>`;

  el.innerHTML = `
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
      (Wd ${inn.extras.wides}, NB ${inn.extras.noBalls}, B ${inn.extras.byes}, LB ${inn.extras.legByes})
    </div>
    ${bowlRows ? `
    <div class="divider mt-sm"></div>
    <div class="section-head mt-sm">BOWLING — ${esc(inn.bowlingTeam)}</div>
    <table class="scorecard-table mt-sm">
      <thead><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
      <tbody>${bowlRows}</tbody>
    </table>` : ''}
    ${fowHtml}
    ${ppHtml}
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
          <span style="font-size:10px;color:#666">${b.isOut ? esc(b.how) : 'not out'}</span></td>
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
        <div style="background:#1B5E20;color:white;padding:8px 12px;border-radius:6px 6px 0 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">
          ${esc(inn.battingTeam)} — ${i >= 2 ? 'Super Over' + (i === 3 ? ' (Chase)' : '') : 'Innings ' + (i + 1)}
        </div>
        <div style="background:white;border-radius:0 0 6px 6px;overflow:hidden">
          <div style="padding:10px 12px">
            <span style="font-size:28px;font-weight:900;color:#1B5E20">${inn.totalRuns}/${inn.wickets}</span>
            <span style="font-size:13px;color:#666;margin-left:6px">(${getOverDisplay(inn)} ov)</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:#F1F8E9">
              <th style="padding:5px 4px;text-align:left;font-size:10px;color:#666;text-transform:uppercase">Batsman</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#666">R</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#666">B</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#666">4s</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#666">6s</th>
            </tr></thead>
            <tbody>${batRows}</tbody>
          </table>
          <div style="padding:6px 12px;font-size:11px;color:#666;border-top:1px solid #E8F5E9">
            Extras: ${totalExtras(inn)} (Wd ${inn.extras.wides}, NB ${inn.extras.noBalls}, B ${inn.extras.byes}, LB ${inn.extras.legByes})
          </div>
          ${(() => {
            const fow = getFallOfWickets(inn);
            if (!fow.length) return '';
            return `<div style="padding:6px 12px;font-size:11px;color:#666;border-top:1px solid #E8F5E9">
              <strong style="color:#1B5E20">Fall:</strong> ${fow.map(f => `${f.num}-${f.score} (${esc(f.batsman)}, ${f.over})`).join(' &nbsp; ')}
            </div>`;
          })()}
          ${(() => {
            const pp = getPowerplayOvers(match.overs);
            const pps = getPowerplayStats(inn, pp);
            if (!pps.played) return '';
            return `<div style="padding:6px 12px;font-size:11px;color:#666;border-top:1px solid #E8F5E9">
              <strong style="color:#1B5E20">Powerplay</strong> (ov 1-${pp}): ${pps.runs}/${pps.wkts}
            </div>`;
          })()}
          ${bowlRows ? `
          <table style="width:100%;border-collapse:collapse;font-size:12px;border-top:2px solid #E8F5E9">
            <thead><tr style="background:#F1F8E9">
              <th style="padding:5px 4px;text-align:left;font-size:10px;color:#666;text-transform:uppercase">Bowler</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#666">O</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#666">R</th>
              <th style="padding:5px 4px;text-align:center;font-size:10px;color:#666">W</th>
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
    body += `<div style="background:#FFCA28;color:#1B5E20;padding:12px;border-radius:6px;text-align:center;font-weight:900;font-size:16px">${txt}</div>`;
  }

  body += `<div style="text-align:center;padding:12px 0 4px;font-size:10px;color:#999">Made with Cricket Umpire App</div>`;

  const ecBody = document.getElementById('ec-body');
  if (ecBody) ecBody.innerHTML = body;
}

function showToast(msg, duration) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration || 2200);
}
