// match.js — match creation and scoring logic (no DOM)

function createMatch({ team1, team2, date, ground, overs }) {
  return {
    id:     'match_' + Date.now(),
    date:   date  || new Date().toISOString().slice(0,10),
    ground: ground|| '',
    status: 'setup',
    overs:  overs || 20,
    toss:   null,
    teams: [
      { name: team1.name, bowlers: team1.bowlers || [], batsmen: team1.batsmen || [] },
      { name: team2.name, bowlers: team2.bowlers || [], batsmen: team2.batsmen || [] }
    ],
    innings:        [null, null],
    currentInnings: 0,
    result:         null
  };
}

function createInnings(battingTeam, bowlingTeam) {
  return {
    battingTeam, bowlingTeam,
    totalRuns: 0, wickets: 0,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
    batsmen: [],
    strikerIdx: -1, nonStrikerIdx: -1,
    overs: [], currentOver: null,
    freeHitNext: false,
    completed: false
  };
}

function createOver(overNumber, bowlerName) {
  return {
    overNumber, bowler: bowlerName,
    balls: [], allDeliveries: [],
    runs: 0, wickets: 0,
    completed: false
  };
}

// Add opening batsmen to an innings
function setOpeners(innings, striker, nonStriker) {
  innings.batsmen = [
    { name: striker,    runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, how: '' },
    { name: nonStriker, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, how: '' }
  ];
  innings.strikerIdx    = 0;
  innings.nonStrikerIdx = 1;
}

// Add a new batsman (after wicket). The replacement takes the crease vacated
// by the dismissed batsman — important for run-outs where the non-striker is out.
function addBatsman(innings, name) {
  const newIdx = innings.batsmen.length;
  innings.batsmen.push({ name, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, how: '' });
  const strikerOut    = innings.batsmen[innings.strikerIdx]    && innings.batsmen[innings.strikerIdx].isOut;
  const nonStrikerOut = innings.batsmen[innings.nonStrikerIdx] && innings.batsmen[innings.nonStrikerIdx].isOut;
  if (nonStrikerOut && !strikerOut) innings.nonStrikerIdx = newIdx;
  else                              innings.strikerIdx    = newIdx;
}

function recordBall(match, { runs, extras, isWicket, wicket }) {
  const inn  = match.innings[match.currentInnings];
  const over = inn.currentOver;

  const eType = extras ? extras.type : null;
  const eRuns = extras ? (extras.runs || 0) : 0;

  const isWide = eType === 'wide';
  const isNB   = eType === 'no_ball';
  const isBye  = eType === 'bye';
  const isLB   = eType === 'leg_bye';
  const isLegal = !isWide && !isNB;

  const striker    = inn.batsmen[inn.strikerIdx]    || null;
  const nonStriker = inn.batsmen[inn.nonStrikerIdx] || null;

  const delivery = {
    deliveryNumber:  over.allDeliveries.length + 1,
    legalBallNumber: isLegal ? over.balls.length + 1 : null,
    runs:    runs    || 0,
    extras:  { type: eType, runs: eRuns },
    isWicket: !!isWicket,
    wicket:   wicket || null,
    freeHit:  inn.freeHitNext,
    batsman:  striker    ? striker.name    : '',
    nonStriker: nonStriker ? nonStriker.name : ''
  };

  over.allDeliveries.push(delivery);
  if (isLegal) over.balls.push(delivery);

  // ── Scoring ──────────────────────────────────────────────
  if (isWide) {
    const tot = 1 + eRuns;
    inn.extras.wides += tot;
    inn.totalRuns    += tot;
    over.runs        += tot;
  } else if (isNB) {
    const tot = 1 + delivery.runs + eRuns;
    inn.extras.noBalls += 1;
    inn.totalRuns      += tot;
    over.runs          += tot;
    if (striker) { striker.runs += delivery.runs; striker.balls++; if(delivery.runs===4)striker.fours++;if(delivery.runs===6)striker.sixes++; }
    inn.freeHitNext = true;
  } else if (isBye) {
    inn.extras.byes += delivery.runs;
    inn.totalRuns   += delivery.runs;
    over.runs       += delivery.runs;
    if (striker) striker.balls++;
  } else if (isLB) {
    inn.extras.legByes += delivery.runs;
    inn.totalRuns      += delivery.runs;
    over.runs          += delivery.runs;
    if (striker) striker.balls++;
  } else {
    inn.totalRuns += delivery.runs;
    over.runs     += delivery.runs;
    if (striker) {
      striker.runs  += delivery.runs;
      striker.balls++;
      if (delivery.runs === 4) striker.fours++;
      if (delivery.runs === 6) striker.sixes++;
    }
    if (!isNB) inn.freeHitNext = false;
  }

  // Clear free hit after non-no-ball legal delivery
  if (isLegal && !isNB) inn.freeHitNext = false;

  // ── Wicket ───────────────────────────────────────────────
  // On a free hit only a run-out counts; every other dismissal is void.
  const wicketCounts = delivery.isWicket && delivery.wicket &&
    (!delivery.freeHit || delivery.wicket.type === 'run_out');
  if (wicketCounts) {
    const out = inn.batsmen.find(b => b.name === delivery.wicket.batsmanOut);
    if (out) { out.isOut = true; out.how = delivery.wicket.type; }
    inn.wickets++;
    over.wickets++;
  }

  // ── Strike rotation ──────────────────────────────────────
  // Batsmen can run byes on a wide too, so rotate on the runs physically run
  // (the extra runs beyond the wide penalty).
  const runsForStrike = isWide ? eRuns
    : (isBye || isLB) ? delivery.runs
    : (delivery.runs || 0) + (isNB ? eRuns : 0);
  if (runsForStrike % 2 === 1) _swapStrike(inn);

  return match;
}

function _swapStrike(inn) {
  const tmp = inn.strikerIdx;
  inn.strikerIdx    = inn.nonStrikerIdx;
  inn.nonStrikerIdx = tmp;
}

function completeOver(match) {
  const inn  = match.innings[match.currentInnings];
  const over = inn.currentOver;
  over.completed = true;
  inn.overs.push(over);
  inn.currentOver = null;
  _swapStrike(inn);  // rotate at end of over
  return match;
}

function startNewOver(match, bowlerName) {
  const inn = match.innings[match.currentInnings];
  inn.currentOver = createOver(inn.overs.length + 1, bowlerName);
  return match;
}

function undoLastBall(match) {
  const inn  = match.innings[match.currentInnings];
  let over = inn.currentOver;

  // Nothing left in the current over? Step back into the previous completed
  // over so undo keeps walking backwards through the innings (not just the
  // current over). Reverse the end-of-over strike swap when we reopen it.
  if (!over || over.allDeliveries.length === 0) {
    if (inn.overs.length === 0) return match;   // start of innings — stop
    const prev = inn.overs.pop();
    prev.completed = false;
    inn.currentOver = prev;
    over = prev;
    _swapStrike(inn);
  }

  const delivery = over.allDeliveries.pop();
  if (delivery.legalBallNumber !== null) over.balls.pop();

  const eType = delivery.extras ? delivery.extras.type : null;
  const eRuns = delivery.extras ? (delivery.extras.runs || 0) : 0;
  const isWide = eType === 'wide', isNB = eType === 'no_ball';
  const isBye = eType === 'bye',   isLB = eType === 'leg_bye';

  // Reverse in the opposite order to recordBall + addBatsman:
  // 1) remove the replacement batsman, 2) un-rotate strike, 3) un-mark the
  // wicket, 4) reverse runs — so strikerIdx is back to the original striker
  // before we subtract the bat runs (correct even for run-outs with runs).

  // 1) Remove the replacement batsman (the last one added), restoring the
  //    dismissed batsman to whichever end they occupied.
  if (delivery.isWicket && delivery.wicket) {
    const lastIdx = inn.batsmen.length - 1;
    if (inn.batsmen.length > 2 && (inn.strikerIdx === lastIdx || inn.nonStrikerIdx === lastIdx)) {
      const outIdx = inn.batsmen.findIndex(b => b.name === delivery.wicket.batsmanOut);
      if (outIdx >= 0) {
        if (inn.strikerIdx === lastIdx) inn.strikerIdx = outIdx;
        else                            inn.nonStrikerIdx = outIdx;
        inn.batsmen.pop();
      }
    }
  }

  // 2) Reverse strike rotation (same rule as recordBall, incl. byes run on wides)
  const runsForStrike = isWide ? eRuns
    : (isBye || isLB) ? delivery.runs
    : (delivery.runs || 0) + (isNB ? eRuns : 0);
  if (runsForStrike % 2 === 1) _swapStrike(inn);

  // 3) Reverse wicket marking
  if (delivery.isWicket && delivery.wicket) {
    const out = inn.batsmen.find(b => b.name === delivery.wicket.batsmanOut);
    if (out) { out.isOut = false; out.how = ''; }
    inn.wickets--;
    over.wickets--;
  }

  // 4) Reverse runs (strikerIdx now points at the original striker)
  const s = inn.batsmen[inn.strikerIdx];
  if (isWide) {
    const tot = 1 + eRuns; inn.extras.wides -= tot; inn.totalRuns -= tot; over.runs -= tot;
  } else if (isNB) {
    const tot = 1 + delivery.runs + eRuns;
    inn.extras.noBalls--; inn.totalRuns -= tot; over.runs -= tot;
    if (s) { s.runs -= delivery.runs; s.balls--; if(delivery.runs===4)s.fours--;if(delivery.runs===6)s.sixes--; }
  } else if (isBye) {
    inn.extras.byes -= delivery.runs; inn.totalRuns -= delivery.runs; over.runs -= delivery.runs;
    if (s) s.balls--;
  } else if (isLB) {
    inn.extras.legByes -= delivery.runs; inn.totalRuns -= delivery.runs; over.runs -= delivery.runs;
    if (s) s.balls--;
  } else {
    inn.totalRuns -= delivery.runs; over.runs -= delivery.runs;
    if (s) { s.runs -= delivery.runs; s.balls--; if(delivery.runs===4)s.fours--;if(delivery.runs===6)s.sixes--; }
  }

  inn.freeHitNext = false; // safest reset on undo
  return match;
}

// ── Edit any ball (replay engine) ─────────────────────────
// Rebuild the entire innings from its stored deliveries. Used after a
// delivery is edited or deleted so totals, strike, over count, wickets and
// bowler figures all recompute consistently — no piecemeal reversal.
function replayInnings(match) {
  const inn = match.innings[match.currentInnings];
  if (!inn) return match;

  const groups = [...inn.overs, ...(inn.currentOver ? [inn.currentOver] : [])]
    .map(o => ({ bowler: o.bowler, deliveries: o.allDeliveries.slice() }));

  // Retirement is not a delivery, so it would be lost on replay — snapshot it.
  const retired = inn.batsmen.filter(b => b.retired)
    .map(b => ({ name: b.name, how: b.how, isOut: b.isOut }));

  // Batting order = order each name first appears across the deliveries.
  const order = []; const seen = new Set();
  groups.forEach(g => g.deliveries.forEach(d => {
    [d.batsman, d.nonStriker].forEach(n => { if (n && !seen.has(n)) { seen.add(n); order.push(n); } });
  }));

  inn.totalRuns = 0; inn.wickets = 0;
  inn.extras = { wides: 0, noBalls: 0, byes: 0, legByes: 0 };
  inn.batsmen = []; inn.overs = []; inn.currentOver = null; inn.freeHitNext = false;

  if (order.length === 0) return match;
  setOpeners(inn, order[0], order[1] || 'Batsman 2');
  let nextBat = 2;

  groups.forEach(g => {
    inn.currentOver = createOver(inn.overs.length + 1, g.bowler);
    g.deliveries.forEach(d => {
      const before = inn.wickets;
      recordBall(match, {
        runs:   d.runs,
        extras: { type: d.extras ? d.extras.type : null, runs: d.extras ? (d.extras.runs || 0) : 0 },
        isWicket: d.isWicket,
        wicket:   d.wicket
      });
      if (inn.wickets > before && inn.wickets < 10) {
        addBatsman(inn, order[nextBat++] || ('Batsman ' + (inn.batsmen.length + 1)));
      }
    });
    if (inn.currentOver && inn.currentOver.balls.length >= 6) completeOver(match);
  });

  retired.forEach(r => {
    const b = inn.batsmen.find(x => x.name === r.name);
    if (b) { b.retired = true; b.how = r.how; if (r.isOut && !b.isOut) { b.isOut = true; inn.wickets++; } }
  });

  // Mark already-passed milestones so they don't pop again after an edit.
  inn.batsmen.forEach(b => { b._m50 = b.runs >= 50; b._m100 = b.runs >= 100; });
  inn._teamMs = Math.floor(inn.totalRuns / 50) * 50;

  return match;
}

function editCurrentBall(match, idx, patch) {
  const inn = match.innings[match.currentInnings];
  const over = inn && inn.currentOver;
  if (!over || !over.allDeliveries[idx]) return match;
  const d = over.allDeliveries[idx];
  d.runs    = patch.runs || 0;
  d.extras  = patch.extras || { type: null, runs: 0 };
  d.isWicket = !!patch.isWicket;
  d.wicket  = patch.wicket || null;
  return replayInnings(match);
}

function deleteCurrentBall(match, idx) {
  const inn = match.innings[match.currentInnings];
  const over = inn && inn.currentOver;
  if (!over || !over.allDeliveries[idx]) return match;
  over.allDeliveries.splice(idx, 1);
  return replayInnings(match);
}

// ── Queries ──────────────────────────────────────────────
function isOverComplete(over) { return over && over.balls.length >= 6; }

function isInningsComplete(inn, totalOvers, maxWkts) {
  maxWkts = maxWkts || 10;
  if (!inn) return false;
  if (inn.wickets >= maxWkts) return true;
  if (inn.overs.length >= totalOvers && !inn.currentOver) return true;
  return false;
}

// ── Super over context ───────────────────────────────────
// Super-over innings live at indices 2 and 3: one over, two wickets each.
function isSuperOver(match)          { return match.currentInnings >= 2; }
function effectiveOvers(match)       { return isSuperOver(match) ? 1 : match.overs; }
function effectiveMaxWickets(match)  { return isSuperOver(match) ? 2 : 10; }

function getOverDisplay(inn) {
  if (!inn) return '0.0';
  const comp   = inn.overs.length;
  const inOver = inn.currentOver ? inn.currentOver.balls.length : 0;
  return comp + '.' + inOver;
}

function getTarget(match) {
  // Chasing innings 1 chases innings 0; super-over chase (3) chases super-over 1st (2).
  const base = match.currentInnings >= 2 ? match.innings[2] : match.innings[0];
  return base ? base.totalRuns + 1 : null;
}

function checkSuperOverResult(match) {
  const a = match.innings[2], b = match.innings[3];
  if (!a || !b) return null;
  if (b.totalRuns > a.totalRuns) return { winner: b.battingTeam, margin: 0, marginType: 'super over' };
  if (a.totalRuns > b.totalRuns) return { winner: a.battingTeam, margin: 0, marginType: 'super over' };
  return { winner: null, margin: 0, marginType: 'tie' };
}

function checkResult(match) {
  const i1 = match.innings[0], i2 = match.innings[1];
  if (!i1 || !i2) return null;
  if (i2.totalRuns > i1.totalRuns) {
    return { winner: i2.battingTeam, margin: 10 - i2.wickets, marginType: 'wickets' };
  } else if (i1.totalRuns > i2.totalRuns) {
    return { winner: i1.battingTeam, margin: i1.totalRuns - i2.totalRuns, marginType: 'runs' };
  }
  return { winner: null, margin: 0, marginType: 'tie' };
}

function getBowlerStats(inn, bowlerName) {
  const overs   = [...inn.overs, ...(inn.currentOver ? [inn.currentOver] : [])];
  const myOvers = overs.filter(o => o.bowler === bowlerName);
  const completedOvers = inn.overs.filter(o => o.bowler === bowlerName).length;
  const inOver = inn.currentOver && inn.currentOver.bowler === bowlerName
    ? inn.currentOver.balls.length : 0;
  const overStr = inOver ? completedOvers + '.' + inOver : String(completedOvers);
  const runs = myOvers.reduce((s, o) => s + o.runs, 0);
  const wkts = myOvers.reduce((s, o) => s + o.wickets, 0);
  const maidens = inn.overs.filter(o => o.bowler === bowlerName && o.runs === 0).length;
  let wides = 0, noBalls = 0;
  myOvers.forEach(o => o.allDeliveries.forEach(d => {
    if (d.extras && d.extras.type === 'wide')    wides++;
    if (d.extras && d.extras.type === 'no_ball') noBalls++;
  }));
  return { overStr, completedOvers, inOver, runs, wkts, maidens, extras: wides + noBalls };
}

function getBowlerFigures(inn, bowlerName) {
  const s = getBowlerStats(inn, bowlerName);
  return `${s.overStr}-${s.maidens}-${s.runs}-${s.wkts}`;
}

// Current (unbroken) partnership: runs and legal balls since the last wicket fell
function getPartnership(inn) {
  let runs = 0, balls = 0;
  const allOvers = [...inn.overs, ...(inn.currentOver ? [inn.currentOver] : [])];
  allOvers.forEach(over => {
    over.allDeliveries.forEach(d => {
      const eType = d.extras ? d.extras.type : null;
      const eRuns = d.extras ? (d.extras.runs || 0) : 0;
      let teamRuns;
      if (eType === 'wide')         teamRuns = 1 + eRuns;
      else if (eType === 'no_ball') teamRuns = 1 + (d.runs || 0) + eRuns;
      else                          teamRuns = d.runs || 0;
      runs += teamRuns;
      if (eType !== 'wide' && eType !== 'no_ball') balls += 1;
      if (d.isWicket && !d.freeHit) { runs = 0; balls = 0; }
    });
  });
  return { runs, balls };
}

function getMaxBowlerOvers(totalOvers) {
  return Math.max(1, Math.floor(totalOvers / 5));
}

// Per-delivery team runs (penalty + bat + extras), matching the scoring in recordBall.
function deliveryTeamRuns(d) {
  const eType = d.extras ? d.extras.type : null;
  const eRuns = d.extras ? (d.extras.runs || 0) : 0;
  if (eType === 'wide')    return 1 + eRuns;
  if (eType === 'no_ball') return 1 + (d.runs || 0) + eRuns;
  return d.runs || 0;
}

// Fall-of-wickets: one entry per counted dismissal, with the score and over it fell.
function getFallOfWickets(inn) {
  const overs = [...inn.overs, ...(inn.currentOver ? [inn.currentOver] : [])];
  let total = 0, legalBalls = 0, wktNum = 0;
  const fow = [];
  overs.forEach(o => o.allDeliveries.forEach(d => {
    total += deliveryTeamRuns(d);
    const eType = d.extras ? d.extras.type : null;
    if (eType !== 'wide' && eType !== 'no_ball') legalBalls++;
    const counts = d.isWicket && d.wicket && (!d.freeHit || d.wicket.type === 'run_out');
    if (counts) {
      wktNum++;
      fow.push({
        num: wktNum, score: total,
        batsman: d.wicket.batsmanOut,
        over: Math.floor(legalBalls / 6) + '.' + (legalBalls % 6)
      });
    }
  }));
  return fow;
}

// Powerplay = first ~30% of overs (6 of 20, 15 of 50), minimum 1.
function getPowerplayOvers(totalOvers) {
  return Math.max(1, Math.round(totalOvers * 0.3));
}

function getPowerplayStats(inn, ppOvers) {
  const overs = [...inn.overs, ...(inn.currentOver ? [inn.currentOver] : [])];
  let runs = 0, wkts = 0, played = 0;
  overs.forEach(o => {
    if (o.overNumber <= ppOvers) { runs += o.runs; wkts += o.wickets; played++; }
  });
  return { runs, wkts, played };
}

function totalExtras(inn) {
  const e = inn.extras;
  return e.wides + e.noBalls + e.byes + e.legByes;
}
