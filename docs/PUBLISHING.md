# Publishing checklist

Everything that has to happen outside the editor before NoWomp can go on Google
Play, plus the state of the things that happen inside it.

---

## Done in code

- Release keystore credentials moved out of `build.gradle` into
  `~/.gradle/gradle.properties`; `*.keystore` is git-ignored. Verified with
  `gradlew signingReport` — release still resolves to `nowomp-upload.keystore`.
- Dev tools gated behind `__DEV__` at both the Settings entry point and the route
  itself, so a deep link cannot reach them in a release build.
- Unused permissions removed from `app.json` and the manifest:
  `SYSTEM_ALERT_WINDOW`, `READ_CALENDAR`, `WRITE_CALENDAR`,
  `READ/WRITE_EXTERNAL_STORAGE`. None were used; all are scrutinised by review.
- Privacy policy updated: calendar entry removed, `INTERNET` documented, and the
  "does not transmit data" claim narrowed to be precisely true.
- Backup format v6.0 carries all user-data tables, including trophies,
  experiments and the full health
  history. Workout rows now restore every column (max HR, calories, distance,
  steps, heart-rate trace); an earlier import silently dropped them.
- TypeScript: 0 errors. Android and web bundles both build.

---

## 1. Back up the keystore ⚠️

`android/app/nowomp-upload.keystore` — copy it somewhere outside this folder
(password manager, encrypted drive). **If this file is lost the app can never be
updated on Play again.** The credentials are in `~/.gradle/gradle.properties`;
back those up too.

## 2. Store assets

The app icon is the pixel-art "fire eyes" penguin, drawn from the same pixel
grid as the trophies. Done:

- **App icon** 512×512 PNG: `docs/images/play-store-icon.png`
- Launcher icons (adaptive, round and Android 13 themed), splash logo and the
  notification silhouette, in `android/app/src/main/res/` and `assets/images/`
- Favicon: `assets/images/favicon.png` (48 px)
- **Feature graphic** 1024×500: `docs/store/feature-graphic.png`

Store text, every Play Console form answer and the release steps are in
[store/play-console-guide.md](store/play-console-guide.md).

Still needed:

- **Phone screenshots**, at least 2 (8 allowed). The strongest visuals are the
  Lab, the trophy room, the experiment result and the widget moods.

## 3. Health Connect declaration — the most likely rejection

Play Console has a **separate Health Connect declaration form** requiring a
per-data-type justification. Ten types are requested; each needs a sentence
saying what it is used for:

| Permission | Justification |
|---|---|
| `READ_HEART_RATE_VARIABILITY` | Primary input to the daily recovery score |
| `READ_RESTING_HEART_RATE` | Second recovery input, read against the user's own baseline |
| `READ_HEART_RATE` | Derives resting heart rate when the device records none, and heart-rate zone minutes |
| `READ_SLEEP` | Sleep duration, stages and the sleep performance score |
| `READ_STEPS` | Daily step total and progress toward the user's step goal |
| `READ_DISTANCE` | Lifetime distance for the Journeys milestone feature |
| `READ_TOTAL_CALORIES_BURNED` | Daily energy expenditure shown on the Health tab |
| `READ_ACTIVE_CALORIES_BURNED` | Movement-only energy, shown alongside total |
| `READ_WEIGHT` | Weight tile and trend |
| `READ_EXERCISE` | Training load (Banister TRIMP) and zone minutes |

One write permission, requested separately and only on opt-in:

| Permission | Justification |
|---|---|
| `WRITE_WEIGHT` | Optional. Off by default. Writes only a weight the user typed into this app, and only after they enable "Also save to Health Connect" — never synced or derived data. |

The app never deletes Health Connect data, and never writes anything but weight.

**Also verify on-device:** firing the rationale intent must land somewhere
sensible. `MainActivity` is `launchMode="singleTask"` with no deep-link handling
for it, so it likely opens the default route rather than a privacy screen.
Reviewers do test this.

## 3b. Foreground service declaration

The workout timer runs as a foreground service, so Play Console asks for a
justification. Declared type is **`specialUse`** with this subtype string
already in the manifest:

> Displays an ongoing timer while the user has a workout running, so the session
> keeps counting when the app is backgrounded.

**Why `specialUse` and not `health`:** the `health` type additionally requires
one of `ACTIVITY_RECOGNITION` / `BODY_SENSORS` / `HIGH_SAMPLING_RATE_SENSORS` at
runtime. This service reads no sensors — it only shows a timer the user started —
so requesting a sensor permission we never use would be worse than the label.
Using `health` without one of those crashes the app at `startForeground`.

`specialUse` gets more scrutiny than the predefined types. If it is rejected, the
fallback is to remove the service (see below) rather than add an unused
permission.

**To remove the feature if review rejects it:** delete the `<service>` block and
the two `FOREGROUND_SERVICE*` permissions from the manifest and `app.json`, and
delete the `WorkoutNotificationNative.isAvailable()` branch in
`services/NotificationService.ts`. The expo notification fallback is still there
and takes over automatically.

## 4. Data Safety form

Must match the privacy policy. The answers:

- **Does your app collect or share user data?** → **No.** Nothing leaves the
  device; there is no server, no analytics, no ads, no tracking SDK.
- **Is data encrypted in transit?** → N/A, no data is transmitted.
- **Can users request deletion?** → Yes, in-app (clear data / uninstall).
- Health Connect data is processed **on-device only** and is not "collected" in
  the Play sense.

⚠️ If a tip jar is added later, revisit this: any billing SDK transmits.

## 5. Privacy policy hosting

The app links to a **hosted** copy at
`doc-hosting.flycricket.io/nowomp-privacy-policy/...` (see
`app/(tabs)/settings.tsx`). Editing local `privacy-policy.html` does nothing
until it is **re-uploaded**. Reviewers check that the URL discloses every
permission requested.

## 6. Listing copy

Short description (80 chars), full description (4000), content rating
questionnaire, target audience, category (Health & Fitness).

## 7. Before each upload

- Bump `versionCode` in **both** `app.json` and `android/app/build.gradle` —
  they are hardcoded separately and can drift because `android/` is committed.
- `npx expo run:android` and smoke-test on a real device.
- Build the AAB and confirm it is signed with the upload key, not the debug key
  (the Gradle config prints a warning if credentials are missing).

---

## Known non-blockers

- **164 `console.log` calls** ship in the release bundle. Harmless — they are
  stripped from user view and only visible via `adb logcat` — but noisy. Worth a
  pass later; several are deliberate sync diagnostics.
- `nul` — a 0-byte file in the project root from a Windows `> nul` redirect. Safe
  to delete; `nul` is a reserved device name and can break archiving tools.
- `backend/` — an abandoned FastAPI stub, fully disconnected from the app. Not
  shipped, but worth deleting to avoid confusion.
