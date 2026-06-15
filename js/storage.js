// storage.js — all localStorage I/O goes through here

const KEYS = {
  MATCHES:   'umpire_matches',
  ROSTERS:   'umpire_rosters',
  SETTINGS:  'umpire_settings',
  ACTIVE:    'umpire_active_match',
  DARK_MODE: 'umpire_dark_mode'
};

function _get(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function _set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ── Matches ──────────────────────────────────────────────
function getMatches()    { return _get(KEYS.MATCHES, []); }

function saveMatch(match) {
  const list = getMatches();
  const idx  = list.findIndex(m => m.id === match.id);
  if (idx >= 0) list[idx] = match; else list.unshift(match);
  _set(KEYS.MATCHES, list);
}

function getMatch(id)    { return getMatches().find(m => m.id === id) || null; }

function deleteMatch(id) {
  _set(KEYS.MATCHES, getMatches().filter(m => m.id !== id));
  if (getActiveMatchId() === id) setActiveMatchId(null);
}

// ── Active match ─────────────────────────────────────────
function getActiveMatchId() { return localStorage.getItem(KEYS.ACTIVE) || null; }
function setActiveMatchId(id) {
  if (id) localStorage.setItem(KEYS.ACTIVE, id);
  else    localStorage.removeItem(KEYS.ACTIVE);
}

// ── Rosters ──────────────────────────────────────────────
function getAllRosters() { return _get(KEYS.ROSTERS, {}); }

function getRoster(teamName) {
  return getAllRosters()[teamName] || [];
}

function addPlayerToRoster(teamName, playerName) {
  const name = playerName.trim();
  if (!name) return;
  const rosters = getAllRosters();
  const list    = rosters[teamName] || [];
  if (!list.includes(name)) {
    list.push(name);
    rosters[teamName] = list.sort();
    _set(KEYS.ROSTERS, rosters);
  }
}

function removePlayerFromRoster(teamName, playerName) {
  const rosters = getAllRosters();
  if (rosters[teamName]) {
    rosters[teamName] = rosters[teamName].filter(p => p !== playerName);
    _set(KEYS.ROSTERS, rosters);
  }
}

function savePlayersFromMatch(match) {
  match.teams.forEach(team => {
    [...team.bowlers, ...team.batsmen].forEach(name => {
      if (name && name.trim()) addPlayerToRoster(team.name, name.trim());
    });
  });
}

// ── Settings ─────────────────────────────────────────────
function getSettings() { return _get(KEYS.SETTINGS, { defaultOvers: 20 }); }
function saveSettings(s) { _set(KEYS.SETTINGS, s); }

// ── Dark mode ─────────────────────────────────────────────
// null = follow system, true = always dark, false = always light
function getDarkMode() { return _get(KEYS.DARK_MODE, null); }
function saveDarkMode(v) { _set(KEYS.DARK_MODE, v); }

// ── Backup & restore ─────────────────────────────────────
function exportAllData() {
  return {
    app: 'cricket-umpire', version: 1, exportedAt: new Date().toISOString(),
    matches:  getMatches(),
    rosters:  getAllRosters(),
    settings: getSettings()
  };
}
function importAllData(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.matches)) return false;
  _set(KEYS.MATCHES, data.matches);
  if (data.rosters && typeof data.rosters === 'object') _set(KEYS.ROSTERS, data.rosters);
  if (data.settings && typeof data.settings === 'object') _set(KEYS.SETTINGS, data.settings);
  return true;
}

// ── Clear all ────────────────────────────────────────────
function clearAll() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
}
