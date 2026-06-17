// storage.js — all localStorage I/O goes through here

const KEYS = {
  MATCHES:    'umpire_matches',
  SETTINGS:   'umpire_settings',
  ACTIVE:     'umpire_active_match',
  DARK_MODE:  'umpire_dark_mode',
  FEED_CACHE: 'umpire_feed_cache'
};

function _get(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function _set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// Cached copy of the last cloud feed, shown instantly on cold start while the
// live Firestore feed reconnects — avoids a 6-7s blank list on launch.
function getCachedFeed() { return _get(KEYS.FEED_CACHE, []); }
function setCachedFeed(feed) {
  try { _set(KEYS.FEED_CACHE, (feed || []).slice(0, 50)); }
  catch (_) { /* localStorage quota — skip caching */ }
}

// ── Matches ──────────────────────────────────────────────
function getMatches()    { return _get(KEYS.MATCHES, []); }

function saveMatch(match) {
  const list = getMatches();
  const idx  = list.findIndex(m => m.id === match.id);
  if (idx >= 0) list[idx] = match; else list.unshift(match);
  _set(KEYS.MATCHES, list);
  // Mirror to the shared cloud collection (no-op if Firebase isn't loaded).
  if (typeof cloudPushMatch === 'function') cloudPushMatch(match);
}

function getMatch(id)    { return getMatches().find(m => m.id === id) || null; }

// Cloud-first: only remove the local copy once the cloud delete confirms, so a
// rejected delete (e.g. you're not the owner) can't leave a half-deleted match.
// Rejects if the cloud refuses — the caller keeps the match and warns the user.
async function deleteMatch(id) {
  if (typeof cloudDeleteMatch === 'function') await cloudDeleteMatch(id);
  _set(KEYS.MATCHES, getMatches().filter(m => m.id !== id));
  if (getActiveMatchId() === id) setActiveMatchId(null);
}

// ── Active match ─────────────────────────────────────────
function getActiveMatchId() { return localStorage.getItem(KEYS.ACTIVE) || null; }
function setActiveMatchId(id) {
  if (id) localStorage.setItem(KEYS.ACTIVE, id);
  else    localStorage.removeItem(KEYS.ACTIVE);
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
    settings: getSettings()
  };
}
function importAllData(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.matches)) return false;
  _set(KEYS.MATCHES, data.matches);
  if (data.settings && typeof data.settings === 'object') _set(KEYS.SETTINGS, data.settings);
  return true;
}

// ── Clear all ────────────────────────────────────────────
function clearAll() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
}
