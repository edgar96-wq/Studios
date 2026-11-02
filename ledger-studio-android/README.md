# Ledger Studio — Android app

Books for a one-person survey business: automatic mileage tracking, trip rules, income and expenses
by Schedule C line, bank-statement uploads, quarterly estimated taxes and the year-end hand-off files.

The app is the Ledger Studio page running offline inside the app, plus a small Android layer
(`app/src/main/java/com/ledgerstudio/app/`):

| File | What it does |
|---|---|
| `MainActivity.java` | Shows the page; permissions; "use my location"; address lookup; camera for receipts; back button |
| `TransitionReceiver.java` | Android says "you're in a vehicle" → starts recording; "you left it" → lets the recording wind down |
| `TrackService.java` | Records one drive (GPS every ~5 s, "Recording a drive" notification); stops on its own after you park |
| `Tracker.java` | The on/off setting, the GPS points file, the tracking log |
| `BootReceiver.java` | Starts listening again after a phone restart or an app update |
| `Ms.java` | Microsoft sign-in (MSAL, single account; same app registration as Crew Studio; permission Files.Read only) |
| `Graph.java` | Reads `GAIA/Jobs` (read-only, fenced): `job.json` → job number, company, status, address only; `field/<job_id>.txt` → centre of the points |
| `Saver.java` | Saves exports through Android's save screen (OneDrive, Downloads…) |

GPS points stay on the phone. The page turns them into trips with the same detector and rules as the
claude.ai preview, then deletes points older than a few days.

## Where the code is
`web/` is the source of the page — `core.js` (trips, rules, taxes, bank files), `phone.js` (the phone-only
parts), `app.js` (screens), `head.html` / `body.html` (style and layout). After changing it:

    python tools/build-web.py      # builds the app page and web/dist/ledger-studio.html (the claude.ai artifact)
    node web/core.test.js          # checks the trip, rule and tax logic

## Getting the APK
Every push to `main` that touches `ledger-studio-android/` runs the checks, builds the app in GitHub Actions
and publishes `LedgerStudio.apk` under **Releases** as "Ledger Studio build N".
On the phone: open the repository's Releases page → newest "Ledger Studio build" → `LedgerStudio.apk` → install
(allow "Install unknown apps" for the browser the first time). New builds install over the old one and keep your data.

## First run on the phone
1. Trips tab → **Setup checklist**: Location → Location all the time → Physical activity → Notifications → Battery: Unrestricted.
2. Setup: set Home with **Use my location** while you're at home.
3. Places: add your saved places (school, work…) and trip rules; add jobs (address → **Find the address**, or SPC N/E).
4. Drive. Trips appear after you park (about 5 minutes later). **Tracking log** shows what the phone did.

## Work from OneDrive (Integration Spec §5–6)
Places → **Connect OneDrive**: Microsoft's sign-in page opens once (MSAL, `app/src/main/res/raw/auth_config.json`).
Same Entra app registration as Crew Studio (client ID `e5c6b607-1663-4f0a-b51c-74996aecab0c`), with this app's own
Android redirect: package `com.ledgerstudio.app`, signature hash `yDTjVnj6whCYU29pPk8Ob2JPWrU=`
(redirect URI `msauth://com.ledgerstudio.app/yDTjVnj6whCYU29pPk8Ob2JPWrU%3D`). A new signing key needs a new redirect in Entra.

**Check for new work** runs when the app opens, when you pull down, and from Places:
- each `GAIA/Jobs/<job_id>/job.json` → one job site: code = `job_id`, `wo.address`, client = `company`;
- position = centre of the points in `field/<job_id>.txt` (FL West State Plane N/E, US ft → lat/lon) when present,
  otherwise the address looked up on the phone; it moves to the points' centre when that file appears. A location you
  set by hand in the job is never moved;
- only changed files are downloaded (eTags, 20 per `$batch`); buyer, seller, agents and the rest of `job.json` never leave `Graph.java`.

Survey jobs are your own contract work (1099): billTo "own", miles deductible. Setup → **Companies**: tick a company only if it
pays your mileage; its jobs then count as employer jobs. Fallback: **Import ledger-jobs.json** (also in the claude.ai preview).

## Data
Everything is saved on the phone. Make a backup each month (Files → Backup) and keep it in OneDrive;
the same backup restores into the claude.ai preview and the other way round.

## Signing
`app/ledgerstudio.keystore` (passwords in `gradle.properties`) signs the test builds, so every build installs as
an update of the previous one. Make a new private key before publishing the app anywhere public.
