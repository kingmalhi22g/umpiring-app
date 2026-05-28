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

// Add a new batsman (after wicket)
function addBatsman(innings, name) {
  innings.batsmen.push({ name, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, how: '' });
  innings.strikerIdx = innings.batsmen.length - 1;
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
  if (delivery.isWicket && delivery.wicket && !delivery.freeHit) {
    // Note: on free hit, only run-out counts. Handled in UI layer.
    const out = inn.batsmen.find(b => b.name === delivery.wicket.batsmanOut);
    if (out) { out.isOut = true; out.how = delivery.wicket.type; }
    inn.wickets++;
    over.wickets++;
  }

  // ── Strike rotation ──────────────────────────────────────
  if (!isWide) {
    const runsForStrike = (isBye || isLB) ? delivery.runs : (delivery.runs || 0) + (isNB ? eRuns : 0);
    if (runsForStrike % 2 === 1) _swapStrike(inn);
  }

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
  const over = inn.currentOver;
  if (!over || over.allDeliveries.length === 0) return match;

  const delivery = over.allDeliveries.pop();
  if (delivery.legalBallNumber !== null) over.balls.pop();

  const eType = delivery.extras ? delivery.extras.type : null;
  const eRuns = delivery.extras ? (delivery.extras.runs || 0) : 0;
  const isWide = eType === 'wide', isNB = eType === 'no_ball';
  const isBye = eType === 'bye',   isLB = eType === 'leg_bye';

  // Reverse runs
  if (isWide) {
    const tot = 1 + eRuns; inn.extras.wides -= tot; inn.totalRuns -= tot; over.runs -= tot;
  } else if (isNB) {
    const tot = 1 + delivery.runs + eRuns;
    inn.extras.noBalls--; inn.totalRuns -= tot; over.runs -= tot;
    const s = inn.batsmen[inn.strikerIdx];
    if (s) { s.runs -= delivery.runs; s.balls--; if(delivery.runs===4)s.fours--;if(delivery.runs===6)s.sixes--; }
  } else if (isBye) {
    inn.extras.byes -= delivery.runs; inn.totalRuns -= delivery.runs; over.runs -= delivery.runs;
    const s = inn.batsmen[inn.strikerIdx]; if(s) s.balls--;
  } else if (isLB) {
    inn.extras.legByes -= delivery.runs; inn.totalRuns -= delivery.runs; over.runs -= delivery.runs;
    const s = inn.batsmen[inn.strikerIdx]; if(s) s.balls--;
  } else {
    inn.totalRuns -= delivery.runs; over.runs -= delivery.runs;
    const s = inn.batsmen[inn.strikerIdx];
    if (s) { s.runs -= delivery.runs; s.balls--; if(delivery.runs===4)s.fours--;if(delivery.runs===6)s.sixes--; }
  }

  // Reverse wicket
  if (delivery.isWicket && delivery.wicket) {
    const out = inn.batsmen.find(b => b.name === delivery.wicket.batsmanOut);
    if (out) { out.isOut = false; out.how = ''; }
    inn.wickets--;
    over.wickets--;
    // If batsman was added as replacement, remove them
    if (inn.batsmen.length > 2 && inn.strikerIdx === inn.batsmen.length - 1) {
      inn.batsmen.pop();
      inn.strikerIdx = inn.batsmen.findIndex(b => b.name === delivery.wicket.batsmanOut);
    }
  }

  // Reverse strike rotation
  if (!isWide) {
    const runsForStrike = (isBye || isLB) ? delivery.runs : delivery.runs;
    if (runsForStrike % 2 === 1) _swapStrike(inn);
  }

  inn.freeHitNext = false; // safest reset on undo
  return match;
}

// ── Queries ──────────────────────────────────────────────
function isOverComplete(over) { return over && over.balls.length >= 6; }

function isInningsComplete(inn, totalOvers) {
  if (!inn) return false;
  if (inn.wickets >= 10) return true;
  if (inn.overs.length >= totalOvers && !inn.currentOver) return true;
  return false;
}

function getOverDisplay(inn) {
  if (!inn) return '0.0';
  const comp   = inn.overs.length;
  const inOver = inn.currentOver ? inn.currentOver.balls.length : 0;
  return comp + '.' + inOver;
}

function getTarget(match) {
  const i0 = match.innings[0];
  return i0 ? i0.totalRuns + 1 : null;
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

function getBowlerFigures(inn, bowlerName) {
  const overs   = [...inn.overs, ...(inn.currentOver ? [inn.currentOver] : [])];
  const myOvers = overs.filter(o => o.bowler === bowlerName);
  const completedOvers = inn.overs.filter(o => o.bowler === bowlerName).length;
  const inOver = inn.currentOver && inn.currentOver.bowler === bowlerName
    ? inn.currentOver.balls.length : 0;
  const overStr = inOver ? completedOvers + '.' + inOver : String(completedOvers);
  const runs    = myOvers.reduce((s, o) => s + o.runs, 0);
  const wkts    = myOvers.reduce((s, o) => s + o.wickets, 0);

  const oversDec = completedOvers + inOver / 6;
  const eco = oversDec > 0 ? (runs / oversDec).toFixed(1) : '-';

  let wides = 0, noBalls = 0;
  myOvers.forEach(o => o.allDeliveries.forEach(d => {
    if (d.extras && d.extras.type === 'wide')    wides++;
    if (d.extras && d.extras.type === 'no_ball') noBalls++;
  }));

  const extrasStr = (wides > 0 || noBalls > 0) ? ` · Wd:${wides} NB:${noBalls}` : '';
  return `${overStr}-${runs}-${wkts} · eco:${eco}${extrasStr}`;
}

function totalExtras(inn) {
  const e = inn.extras;
  return e.wides + e.noBalls + e.byes + e.legByes;
}
