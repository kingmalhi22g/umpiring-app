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

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyAbqn_7pFzXLX0Q6lVhSTr2T2oV0aO-YIE',
  authDomain:        'tally-stats.firebaseapp.com',
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
function cloudUid()       { return _uid; }
function cloudEmail()     { return _email; }
function cloudIsAnon()    { return _isAnon; }
function cloudIsAdmin()   { return _isAdmin; }
function cloudReady()     { return _ready; }

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

function _startFeed() {
  if (!_db || !_feedCb || _unsubFeed) return;
  _unsubFeed = _db.collection('matches')
    .orderBy('updatedAt', 'desc')
    .limit(200)
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
  if (!cloudAvailable() || !_uid) return;
  if (!match.ownerId) match.ownerId = _uid;
  // Only sync matches you own (or anything, if you're the admin).
  if (match.ownerId !== _uid && !_isAdmin) return;

  clearTimeout(_pushTimers[match.id]);
  if (match.status === 'completed') {
    _doPush(match);                                   // finished → save now
  } else {
    _pushTimers[match.id] = setTimeout(() => _doPush(match), 1500);
  }
}

function _doPush(match) {
  delete _pushTimers[match.id];
  _db.collection('matches').doc(match.id).set({
    ownerId:   match.ownerId || _uid,
    status:    match.status || 'setup',
    matchJson: JSON.stringify(match),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).catch(e => console.error('[cloud] push failed', e));
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
  // If currently anonymous, link so matches made anonymously keep their owner.
  if (cur && cur.isAnonymous) {
    return cur.linkWithPopup(provider).catch(err => {
      if (err.code === 'auth/credential-already-in-use' ||
          err.code === 'auth/email-already-in-use') {
        return _auth.signInWithPopup(provider);       // account already exists
      }
      throw err;
    });
  }
  return _auth.signInWithPopup(provider);
}

function cloudSignOut() {
  if (!_auth) return Promise.resolve();
  return _auth.signOut(); // auth listener then re-signs in anonymously
}
