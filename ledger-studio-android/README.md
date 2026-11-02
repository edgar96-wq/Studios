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
| `OneDrive.java` | Reads `GAIA/Jobs` in OneDrive (read-only): each `job.json` → job number, company, status, address, State Plane N/E only |
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

## Jobs from OneDrive (Integration Spec §5–6)
Places → **Connect OneDrive** (once): paste the Application (client) ID of a Microsoft app registration
(personal accounts allowed, "Allow public client flows" = Yes, permission Files.Read), then sign in with the code
the app shows. The app checks `GAIA/Jobs` when it opens, when you pull down, and with **Check for new jobs**.
- Each job folder's `job.json` becomes a job site: `job_id` = code, `wo.address`, `company` = client
  (or from the job number prefix, §3), location from State Plane N/E when the record has them
  (`site`/`spc` {n,e} or `spcN`/`spcE`), otherwise from the address.
- Only those fields are passed from `OneDrive.java` to the page; buyer, seller, agents and the rest of `job.json` are dropped on the phone.
- Survey jobs count as **My business** (contractor, 1099): their miles are deducted. One switch in the OneDrive panel changes it.
- Fallback: **Import ledger-jobs.json** still works (also in the claude.ai preview, which can't reach OneDrive).

## Data
Everything is saved on the phone. Make a backup each month (Files → Backup) and keep it in OneDrive;
the same backup restores into the claude.ai preview and the other way round.

## Signing
`app/ledgerstudio.keystore` (passwords in `gradle.properties`) signs the test builds, so every build installs as
an update of the previous one. Make a new private key before publishing the app anywhere public.
