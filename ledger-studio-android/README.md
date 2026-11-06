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
| `Ms.java` | Microsoft sign-in (MSAL, single account; Ledger Studio's own app registration; Files.Read + User.Read, read-only) |
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
Ledger Studio's own Entra app registration (client ID `edd3b4cd-0912-4c99-b411-93b9c2734d9c`, personal and work accounts,
authority `common`, no secret), Android platform: package `com.ledgerstudio.app`, signature hash `yDTjVnj6whCYU29pPk8Ob2JPWrU=`
(redirect URI `msauth://com.ledgerstudio.app/yDTjVnj6whCYU29pPk8Ob2JPWrU%3D`). A new signing key needs a new redirect in Entra.

**Check for new work** runs when the app opens, when you pull down, and from Places:
- each `GAIA/Jobs/<job_id>/job.json` → one job site: code = `job_id`, `wo.address`, client = `company`;
- position = centre of the points in `field/<job_id>.txt` (FL West State Plane N/E, US ft → lat/lon) when present,
  otherwise the address looked up on the phone; it moves to the points' centre when that file appears. A location you
  set by hand in the job is never moved;
- only changed files are downloaded (eTags, 20 per `$batch`); buyer, seller, agents and the rest of `job.json` never leave `Graph.java`.

Survey jobs are your own contract work (1099): billTo "own", miles deductible. Setup → **Companies**: tick a company only if it
pays your mileage; its jobs then count as employer jobs. Fallback: **Import ledger-jobs.json** (also in the claude.ai preview).

## Money: categories and bank statements
- You pick a **category** (field supplies, tools, safety gear, phone, software, dues, training, bank fees, tax prep, licenses…); each one files to its
  Schedule C line by itself (`CATS` in `web/core.js`). Lines a one-person survey contractor doesn't use are not offered.
- Books → **Import statement (.csv)**: any bank/card CSV. If Atlas adds the columns `line, job, note, confidence`
  ([docs/ledger-transactions-for-atlas.md](docs/ledger-transactions-for-atlas.md)), `high` rows are filed straight away; rows already waiting for
  review are updated, not duplicated.
- **To review** is grouped by merchant: **File all** files them and remembers the merchant for the next statements.

## Reports and closing a year
- **Reports** tab: profit & loss for this month, last month, this quarter, year to date or last year, each against the period before;
  income vs deductions by month; survey companies (jobs driven to × pay per job = earned, against their deposits = paid); profit per job
  (pay − miles × IRS rate − linked expenses); top merchants; P&L export (.csv). "Not final yet" lists what is still open (reviews, missing statement months, jobs without a location).
- Company deposits are recognised on import (company name, or the bank text in Setup → Companies) and filed as survey pay. Pay per job is set there too.
- Every statement import is logged (last 20) and can be undone in Files.
- Taxes → **Close YEAR (after you file)** locks that year: imports skip its rows, trips are not re-filed, and edits are refused until it is reopened.

## Data
Everything is saved on the phone. Make a backup each month (Files → Backup) and keep it in OneDrive;
the same backup restores into the claude.ai preview and the other way round.

## Signing
`app/ledgerstudio.keystore` (passwords in `gradle.properties`) signs the test builds, so every build installs as
an update of the previous one. Make a new private key before publishing the app anywhere public.
