# >> DEPLOY FIRST  (handoff to Claude Code - 2026-06-16)

Claude Code runs locally and CAN deploy (Cowork's sandbox can't reach git/Firebase creds).
There are finished changes on disk. To ship:

    cd "C:\Users\SAM\Documents\Umpiring app project"
    git add -A && git commit -m "Broadcast redesign + scaling" && git push origin main

Pushing to `main` AUTO-DEPLOYS via GitHub Actions (set up this session). Or deploy directly:
`firebase deploy --only hosting`. Live: https://tally-stats.web.app. Asset cache is at **?v=71**.
(If `git push` reports "Everything up-to-date", the latest batch is already committed/pushed - just confirm the Actions run is green.)

## What changed this session
- **Broadcast "Sky" theme applied to the WHOLE app** (previously live-screen only): home, match-setup,
  toss, live, end-of-over, innings-break, summary, settings each get a navy gradient `.scr-hero` header
  (italic Archivo titles), team crests, skewed Saira numerals, gradient buttons, status pills.
  Token-driven, so LIGHT + DARK both work. New CSS = appended blocks in `css/redesign.css`
  ("APP-WIDE BROADCAST THEME", live "BROADCAST DIRECTION", plus small fix blocks at the end).
- **Live screen** rebuilt to a broadcast scoreboard: LIVE pill + format/innings label, crest + big skewed
  score + overs, 2nd-team row, CRR/Proj/P'ship strip, compact batting table, single-line bowler.
  A Last-5-overs momentum chart was added then REMOVED (user called it useless) - `renderMomentum` in
  ui.js is now dead code (unused), markup gone.
- **Bowler line** now shows **O-M-R-W . extras . economy** (`setBowlerFig` in `js/ui.js`).
- **Undo** moved out of the hero into the "This over" strip, right after the runs total (`.over-undo`).
- **Fixes**: match-setup compacted so Continue shows without scrolling; home refresh button
  (`#btn-refresh`) restyled to be visible in LIGHT mode (was white-on-light).
- **End-of-over / innings-break** markup restructured + `renderOverSummary` / `renderInningsBreak`
  (ui.js) updated. New IDs: ib-team-crest, ib-team-name, ib-bignum, ib-need-line, ib-target-num,
  ib-row-target, ib-row-overs, ib-row-rpo. Removed old IDs ib-score / ib-target.
- **Scaling (free, no Blaze) in `js/cloud.js` + `js/app.js`**:
  - Home feed now DETACHES when off the home screen (`cloudUnsubscribeMatches`, wired in app.js
    `onScreenChange`; `_cloudFeed` is the snapshot handler). Scorers/spectators off-home cost 0 feed reads.
  - Feed `.limit(200) -> .limit(75)`.
  - Live-scoring write debounce `1500ms -> 4000ms`.

## Auto-deploy (configured this session)
- Ran `firebase init hosting:github`. Workflows: `.github/workflows/firebase-hosting-merge.yml`
  (push to main -> deploy) and `firebase-hosting-pull-request.yml` (PR previews). GitHub repo secret
  `FIREBASE_SERVICE_ACCOUNT_TALLY_STATS` is set. Every push to `main` auto-deploys.
- `firebase.json` `ignore` now excludes `.git/**`, `.github/**`, `.firebase/**`, `.claude/**`, `*.bat`.
  (Spark plan rejects executable files - first Action run failed with "Executable files are forbidden
  on the Spark billing plan" because `.git` + `.bat` were being uploaded.) Added `Cache-Control: no-cache`
  headers for `/index.html`, `/`, `/service-worker.js`.
- Repo-root helper scripts (ignored from hosting): `deploy.bat` (one-click `firebase deploy`),
  `ship.bat` (one-click git add+commit+push).

## Scaling reality (answer to "will 100 users crash it?")
No crash (serverless). The risk is the **free Spark plan's daily Firestore quotas** (~50K reads/day).
The expensive bit is feed read fan-out: a change to one match pushes to every listener (1 read each).
With live scoring + 100 people that could exhaust reads in minutes -> app stops syncing (not crash) until
midnight PT. The free optimizations above cut this a lot. For real scale, **upgrade to Blaze** (pay-as-you-go;
~$0.06 per 100K reads, removes daily caps). Further free win: per-match listeners for spectators instead of
the shared feed (not yet built).

## Verify after deploy
The Cowork editor intermittently truncated files mid-save this session; index.html, ui.js, cloud.js, app.js
were each rebuilt from `git HEAD` + re-applied edits and re-verified (all pass `node -c`, no NUL bytes,
sections balanced). Still worth a smoke test: home -> new match -> toss -> live (score balls, undo, wicket)
-> end of over -> innings break -> summary, in BOTH light and dark; and open on two devices to confirm a
scored ball appears on the other's home list.

---

# Cricket Umpire — Session Handoff

_Last updated: 2026-06-15. Live at **https://tally-stats.web.app** (currently v65)._

## 1. What this is
A ball-by-ball cricket umpiring/scoring **PWA**. Vanilla JS (no build step, no framework), served by **Firebase Hosting**. Matches sync to **Cloud Firestore** so they're visible across devices/people.

## 2. Where everything lives
| Thing | Location |
|---|---|
| Local files | `C:\Users\SAM\Documents\Umpiring app project` |
| Live site | https://tally-stats.web.app |
| GitHub repo | https://github.com/kingmalhi22g/umpiring-app (branch `main`) |
| Firebase project | `tally-stats` — https://console.firebase.google.com/project/tally-stats |
| Firestore data | console → Firestore → `matches` collection |
| Firebase CLI login | `kingmalhi22g@gmail.com` (already logged in) |

## 3. Code map
- `index.html` — all screens (single-page, screens toggled by `.active`)
- `js/app.js` — app logic, event wiring, screen setup, init
- `js/match.js` — scoring rules/state (createMatch, recordBall, etc.)
- `js/ui.js` — rendering (renderMatchList, renderMatchSummary, live header…)
- `js/cloud.js` — Firebase: anon auth, Google admin sign-in, Firestore sync
- `js/storage.js` — localStorage I/O + cloud write-through hooks
- `js/router.js` — hash screen routing
- `css/style.css` — **design tokens** (`:root` light + `body.dark-mode` + `@media prefers-color-scheme:dark`) + base
- `css/layout.css`, `css/components.css`, `css/redesign.css` (loaded last, wins)
- `firestore.rules` — security rules

## 4. Conventions / gotchas (IMPORTANT)
- **Cache-bust on every CSS/JS change:** bump the `?v=NN` query on all asset links in `index.html` (one number, currently 65). Use `sed -i 's/?v=65/?v=66/g' index.html`. Otherwise users get stale files.
- **Deploy:** `firebase deploy --only hosting` (and `--only firestore:rules` for rules). No build step.
- **No service worker** (deliberately removed to avoid stale-build issues; `initApp` actively unregisters any). So Android one-tap PWA install isn't available — the "Add to Home Screen" button falls back to instructions.
- **Verify in the live preview** (Claude Preview MCP). Dev server already runs on `localhost:3001`. Toggle theme in-page with `applyDarkMode(true|false)`; jump screens with `navigateTo('home'|'live'|'summary'|'settings'|...)`. Test **both light AND dark**.
- **Never delete user data without asking; scope deletes to exact match IDs** (a broad team-name cleanup once removed real test matches — see memory `confirm-before-deleting`).
- The preview's `localStorage` (localhost:3001) is a **separate origin** from the live site / the user's phone — its matches ≠ production data. Only Firestore is shared.

## 5. Cloud architecture (already built & working)
- **Everyone is signed in anonymously** (no sign-up screen) so they can read/write.
- **Admin = `kingmalhi22g@gmail.com` only**, via Google sign-in (Settings → Sharing & Account). Enforced server-side in `firestore.rules` (email + email_verified).
- Auth getters in `cloud.js` read **live** from `firebase.auth().currentUser` (not cached) — needed because `linkWithPopup` doesn't always re-fire `onAuthStateChanged`.
- Each match stored as a **JSON blob** (`matchJson`) in the doc, plus readable summary fields (title/team1/team2/score1/score2/result/…) so the Firestore console is legible.
- Home feed = live `onSnapshot`, `.limit(200)`, newest first. No server-side pruning (unlimited stored).
- **Delete is cloud-first** (`deleteMatch` awaits the cloud delete, only then removes local; rejection keeps the match). Rules allow deleting a non-existent doc (`resource == null`) so local-only matches still delete.
- Rosters/player-autocomplete were fully removed earlier.

## 6. Current visual state — "Sky" redesign (just finished)
Navy/cyan + amber broadcast theme copied from user's mockup (`~/Downloads/Cricket Umpire - Sky Redesign.dc.html`), in **both light and dark**, features/data unchanged. Fonts: Archivo (`--font-display`), Saira Condensed (`--font-num`), Hanken Grotesk (`--font-body`). Theming is token-driven; reusable vars `--grad-cyan/--grad-amber/--grad-wicket/--grad-header` + `--on-cyan/--on-amber`. Commits `45aced8`, `9482645`, `9724687`.

Verified in preview (light+dark): **home, live, summary, settings, confirm modal**.

## 7. OPEN THREADS / next steps
1. **Verify the Sky look on the 3 flow screens I couldn't put into state:** Toss, End-of-over, Innings-break. They use the same tokenised components so should match, but confirm on a real match. Also general device QA (iPhone/Android, safe areas, a long over on the live screen).
2. **Share-image still green:** the off-screen export templates `#export-card` and `#oversheet-card` (in `index.html`, built by `renderExportCard`/`renderOverSheet` in `js/ui.js`) still use the old **green** scorecard branding — NOT re-skinned to Sky. User was asked whether to convert; awaiting answer.
3. **Admin backfill not yet run:** existing older cloud matches lack the readable summary fields. Fix = user signs in as admin (Settings) → taps "🛠️ Add readable info to all matches" (`cloudBackfillSummaries`).
4. **App name / URL undecided.** `tallyscore.web.app` is unavailable (a create-then-delete availability check put it + `crease`/`howzatcricket`/`howzatlive`/`stumpscore` into Firebase's "recently deleted" hold; `howzat`/`tally-score`/`cricktally`/`scoretally` are taken by others). **Parked (claimed, empty) test sites in the project to clean up once a name is chosen:** `tallyscoreapp, tallyscorelive, tallyscorehq, tallycricket, tallypro, overtally, runboard, maidenscore, cricktally2`. The app's display name is still "Cricket Umpire". Deleting a site burns its name for a cooldown, so don't delete the chosen one. To give the app a nicer URL without a new project: `firebase hosting:sites:create <name>` + add to `firebase.json` hosting (array form) + add the domain to Firebase Auth authorized domains (console) so Google sign-in works there.
5. **Declined for now (don't build unless asked):** Last-5-overs momentum chart, Player-of-the-Match (user chose "restyle only"). Ads (advised against at current scale).
6. **Possible later:** prune cloud collection past 200; optional "sign in with Google to sync" nudge for regular users; custom domain (~$12/yr); App Check.

## 8. Decisions on record (so they aren't re-litigated)
- Sharing visible to all; only creator (per-device, or via Google login) or admin can edit/delete.
- Light **and** dark both kept (Sky has both variants); dark-mode toggle stays in Settings.
- "Restyle only" for the redesign — no new data/features.
- Match Format presets removed; home has All/My tabs + refresh + pull-to-refresh; double-tap-zoom disabled (CSS + JS guard); share opens an on-screen preview before sharing; feed shows newest 200.
