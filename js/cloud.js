// cloud.js — Firebase sync layer.
//
// Goal: matches are mirrored to a shared Firestore collection so they're
// visible on every device and to other people. Everyone is signed in
// *anonymously* (no sign-up screen). The admin signs in with Google and can
// edit/delete any match. Enforcement lives in firestore.rules — this file just
// reads/writes; it can never grant more than the rules allow.
//
// If the Firebase SDK fails to load (offline, blocked), every function here
// no-ops and the app keeps working as a local-only app.

// iOS Safari blocks the cross-origin OAuth flow (auth handler on a different
// origin than the app), so sign-in silently failed on iPhone. Only on iOS, run
// the auth handler first-party on the hosting domain. Desktop keeps the default
// firebaseapp.com handler untouched (so it can't regress).
const _ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
const _isIOS = /iphone|ipad|ipod/i.test(_ua) ||
  (/Macintosh/.test(_ua) && typeof document !== 'undefined' && 'ontouchend' in document);

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyAbqn_7pFzXLX0Q6lVhSTr2T2oV0aO-YIE',
  authDomain:        _isIOS ? 'scoringbook.web.app' : 'tally-stats.firebaseapp.com',
  projectId:         'tally-stats',
  storageBucket:     'tally-stats.firebasestorage.app',
  messagingSenderId: '927750615819',
  appId:             '1:927750615819:web:4b0f7b35a13aeca2c7280e'
};

// The single admin. Must match the rule in firestore.rules exactly.
const ADMIN_EMAIL = 'kingmalhi22g@gmail.com';

let _db   = null;
let _auth = null;
let _uid  = null;     // current user id (anonymous or Google)
let _email = null;    // Google email, or null when anonymous
let _isAnon = true;   // true while signed in anonymously
let _isAdmin = false;
let _ready   = false; // true once we have a signed-in user
let _feedCb  = null;  // home-feed callback
let _unsubFeed = null;
const _pushTimers = {}; // debounce timers, keyed by match id

function cloudAvailable() { return typeof firebase !== 'undefined' && !!_db; }

// Read auth state LIVE from currentUser so the UI is correct the instant a
// sign-in / link resolves, even if onAuthStateChanged doesn't re-fire (which
// happens when linking an anonymous account to Google).
function _curUser() { return (_auth && _auth.currentUser) || null; }
function _userEmail(u) {
  if (!u) return null;
  if (u.email) return u.email;
  if (u.providerData) { for (const p of u.providerData) { if (p && p.email) return p.email; } }
  return null;
}
function cloudUid()   { const u = _curUser(); return u ? u.uid : _uid; }
function cloudEmail() { return _userEmail(_curUser()); }
function cloudIsAnon(){ const u = _curUser(); return u ? !!u.isAnonymous : true; }
function cloudIsAdmin() {
  const u = _curUser(); const e = _userEmail(u);
  return !!(u && !u.isAnonymous && e && e.toLowerCase() === ADMIN_EMAIL);
}
function cloudReady()  { return _ready || !!_curUser(); }

// ── Init + auth ───────────────────────────────────────────
function cloudInit() {
  if (typeof firebase === 'undefined') {
    console.warn('[cloud] Firebase SDK not loaded — running local-only.');
    return;
  }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    _auth = firebase.auth();
    _db   = firebase.firestore();
  } catch (e) {
    console.error('[cloud] init failed', e);
    return;
  }

  // Complete a redirect-based sign-in if we just came back from one (mobile).
  _auth.getRedirectResult()
    .then(res => { if (res && res.user) { _startFeed(); if (typeof onCloudAuth === 'function') onCloudAuth(); } })
    .catch(e => {
      console.error('[cloud] redirect sign-in failed', e);
      if (typeof showToast === 'function') showToast('Sign-in error: ' + (e.code || e.message || 'unknown'));
    });

  _auth.onAuthStateChanged(user => {
    if (user) {
      _uid     = user.uid;
      _isAnon  = !!user.isAnonymous;
      _email   = user.email || null;
      _isAdmin = !!(user.email && user.email.toLowerCase() === ADMIN_EMAIL && !user.isAnonymous);
      _ready   = true;
      _startFeed();
      if (typeof onCloudAuth === 'function') onCloudAuth();
    } else {
      // No user yet — sign in anonymously so reads/writes work with no sign-up.
      _ready = false;
      _auth.signInAnonymously().catch(e => console.error('[cloud] anonymous sign-in failed', e));
    }
  });
}

// ── Home feed (live, all matches) ─────────────────────────
function cloudSubscribeMatches(cb) {
  _feedCb = cb;
  if (_ready) _startFeed();
}

// Detach the live feed listener. Called when the user leaves the home screen
// so 100 idle devices aren't each billed a read for every ball scored anywhere.
function cloudUnsubscribeMatches() {
  if (_unsubFeed) { _unsubFeed(); _unsubFeed = null; }
}

function _startFeed() {
  if (!_db || !_feedCb || _unsubFeed) return;
  _unsubFeed = _db.collection('matches')
    .orderBy('updatedAt', 'desc')
    .limit(75)
    .onSnapshot(snap => {
      const arr = [];
      snap.forEach(doc => {
        const d = doc.data();
        if (!d || !d.matchJson) return;
        try {
          const m = JSON.parse(d.matchJson);
          m.ownerId = d.ownerId || null;
          arr.push(m);
        } catch (_) { /* skip a corrupt doc */ }
      });
      _feedCb(arr);
    }, err => console.error('[cloud] feed error', err));
}

// ── Write-through ─────────────────────────────────────────
// Stores the whole match as a JSON blob so Firestore never trips over the
// deeply-nested scoring structure. Live scoring is debounced; a finished match
// is pushed immediately.
function cloudPushMatch(match) {
  const uid = cloudUid();
  if (!cloudAvailable() || !uid) return;
  if (!match.ownerId) match.ownerId = uid;
  // Only sync matches you own (or anything, if you're the admin).
  if (match.ownerId !== uid && !cloudIsAdmin()) return;

  clearTimeout(_pushTimers[match.id]);
  if (match.status === 'completed') {
    _doPush(match);                                   // finished → save now
  } else {
    _pushTimers[match.id] = setTimeout(() => _doPush(match), 4000);
  }
}

function _doPush(match) {
  delete _pushTimers[match.id];
  _db.collection('matches').doc(match.id).set(Object.assign({
    ownerId:   match.ownerId || cloudUid(),
    status:    match.status || 'setup',
    matchJson: JSON.stringify(match),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, _summaryFields(match)), { merge: true })
    .catch(e => console.error('[cloud] push failed', e));
}

// Human-readable fields so the match is legible in the Firestore console
// (the app itself still reads matchJson). Best-effort — never throws.
function _summaryFields(match) {
  try {
    const t1 = match.teams && match.teams[0] ? match.teams[0].name : '';
    const t2 = match.teams && match.teams[1] ? match.teams[1].name : '';
    const innFor = name => (match.innings || []).find(i => i && i.battingTeam === name);
    const overStr = inn => (inn && typeof getOverDisplay === 'function') ? getOverDisplay(inn) : '';
    const score = inn => inn ? (inn.totalRuns + '/' + inn.wickets + ' (' + overStr(inn) + ')') : '';
    const result = match.result
      ? (typeof matchResultText === 'function' ? matchResultText(match) : '')
      : '';
    return {
      title:     (t1 || '?') + ' vs ' + (t2 || '?'),
      team1:     t1,
      team2:     t2,
      score1:    score(innFor(t1)),
      score2:    score(innFor(t2)),
      format:    (match.overs || '') + ' overs',
      matchDate: match.date || '',
      ground:    match.ground || '',
      result:    result
    };
  } catch (e) {
    return {};
  }
}

// Admin-only: rewrite the readable summary fields on every existing match doc
// (for matches saved before summary fields existed). Returns {updated,skipped,total}.
async function cloudBackfillSummaries() {
  if (!cloudAvailable()) throw new Error('Cloud not ready');
  if (!cloudIsAdmin()) throw new Error('Admin only');
  const snap = await _db.collection('matches').get();
  let updated = 0, skipped = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!d || !d.matchJson) { skipped++; continue; }
    let m;
    try { m = JSON.parse(d.matchJson); } catch (_) { skipped++; continue; }
    try { await doc.ref.set(_summaryFields(m), { merge: true }); updated++; }
    catch (e) { skipped++; }
  }
  return { updated, skipped, total: snap.size };
}

// Returns a promise: resolves when the cloud doc is gone (or there's no cloud
// to talk to), rejects if the server refuses (e.g. not the owner). Deleting a
// non-existent doc resolves successfully.
function cloudDeleteMatch(id) {
  clearTimeout(_pushTimers[id]);
  if (!cloudAvailable()) return Promise.resolve();   // local-only mode
  return _db.collection('matches').doc(id).delete();
}

// ── Admin sign-in / out ───────────────────────────────────
function cloudSignInGoogle() {
  if (!_auth) return Promise.reject(new Error('Firebase not ready'));
  const provider = new firebase.auth.GoogleAuthProvider();
  const cur = _auth.currentUser;

  // Refresh UI/feed once a sign-in resolves (onAuthStateChanged may not fire
  // when linking an anonymous account).
  const finish = res => { _startFeed(); if (typeof onCloudAuth === 'function') onCloudAuth(); return res; };

  // iOS Safari heavily restricts popups (they silently fail to open), so the
  // popup-first flow just did nothing on iPhone. Go straight to a full-page
  // redirect there — completed by getRedirectResult() when we come back.
  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
  if (isIOS) return _auth.signInWithRedirect(provider);

  // Popups are unreliable on mobile; fall back to a full-page redirect.
  const isPopupProblem = e => e && [
    'auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request',
    'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'
  ].includes(e.code);

  // If currently anonymous, link so matches made anonymously keep their owner.
  const popup = (cur && cur.isAnonymous)
    ? cur.linkWithPopup(provider).catch(err => {
        if (err.code === 'auth/credential-already-in-use' ||
            err.code === 'auth/email-already-in-use') {
          return _auth.signInWithPopup(provider);     // account already exists
        }
        throw err;
      })
    : _auth.signInWithPopup(provider);

  return popup.then(finish).catch(err => {
    if (isPopupProblem(err)) return _auth.signInWithRedirect(provider); // page reloads
    throw err;
  });
}

function cloudSignOut() {
  if (!_auth) return Promise.resolve();
  return _auth.signOut(); // auth listener then re-signs in anonymously
}
