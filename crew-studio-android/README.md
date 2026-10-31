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

## Signing
`app/crewstudio.keystore` (passwords in `gradle.properties`) signs the test builds, so every build installs as
an update of the previous one. Make a new private key before publishing the app anywhere public.
