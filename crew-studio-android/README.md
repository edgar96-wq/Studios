# Crew Studio — Android app

Field app for survey crews: field notes, GPS shots from the rover (Bluetooth), NTRIP corrections over the
phone's internet, stake-out, revision and exports (PNG/PDF/DXF/TXT, saved to OneDrive or the phone).

The app is the Crew Studio page (`app/src/main/assets/www/index.html`) running offline inside the app, plus a
small Android layer (`app/src/main/java/com/crewstudio/app/`):

| File | What it does |
|---|---|
| `MainActivity.java` | Shows the page, edge to edge; back button; camera/gallery for job photos; opens map links in Google Maps |
| `RoverLink.java` | Bluetooth serial (SPP) to the rover, reads NMEA (GGA/GST/GSA); NTRIP client that sends the rover's position and writes RTCM corrections to the rover; both reconnect on their own |
| `Saver.java` | Saves exports: Android's save screen (OneDrive appears there), a folder picked once, or Downloads › Crew Studio |

## Getting the APK
Every push to `main` that touches `crew-studio-android/` builds the app in GitHub Actions and publishes `CrewStudio.apk` under **Releases**.
On the phone: open the repository's Releases page → latest build → `CrewStudio.apk` → install
(allow "Install unknown apps" for the browser the first time). New builds install over the old one and keep the jobs.

## Updating the page
After changing Crew Studio, copy the new page in and push:

    python tools/sync-web.py path/to/CrewStudio.html

## First run on the phone
1. Pair the rover in Android's Bluetooth settings (FieldGenius must not be connected to it at the same time).
2. Crew Studio → GPS → Rover setup: Instrument "GNSS rover", link "Data collector internet (NTRIP)",
   caster, port, mount point, and your NTRIP username/password (kept only on the phone).
3. GPS → Connect → pick the rover. Android asks once for "Nearby devices": allow it.
4. The Fix tile turns FIX when the corrections arrive (the link tile shows NTRIP ✓).

## OneDrive (MSAL) and the GAIA Today widget
- Sign-in: Microsoft's MSAL library, single-account mode, `app/src/main/res/raw/auth_config.json`
  (client e5c6b607-…, authority *common*: personal and work accounts). Redirect
  `msauth://com.crewstudio.app/q%2BJQXAeUCkn%2FI9%2BYG0TtaSLYbQA%3D` = this keystore's signature hash; a new key needs
  a new redirect in Entra. Scopes Files.ReadWrite + User.Read (MSAL adds offline_access). Tokens stay inside MSAL's
  private storage; the page only sees the account name.
- `Graph.java` does every OneDrive call in Java, and refuses any path outside `GAIA/Jobs`. The page calls it through the
  bridge: `listJobs`, `readFile`, `uploadFile` (simple PUT ≤ 4 MB, upload session above), `writeJobJson`
  (job.json.tmp, then rename over job.json). Answers come back as the `graph` event.
- Widget: long-press the home screen → Widgets → Crew Studio → **GAIA Today** (4×2; stretch to 4×3 for more jobs).
  It reads only `files/today.json`, written by the page (`writeToday`) and by the background check.
- Background check (`GaiaSyncWorker`, WorkManager): about 5:30 AM and every 60 minutes, network only, only while signed in.

## Signing
`app/crewstudio.keystore` (passwords in `gradle.properties`) signs the test builds, so every build installs as
an update of the previous one. Make a new private key before publishing the app anywhere public.
