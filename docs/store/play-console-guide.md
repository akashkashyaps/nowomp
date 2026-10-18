# Play Console guide: NoWomp 2.0.0 update

Everything to fill in, in the order the Play Console shows it. Text in boxes is
ready to paste. Character limits are noted where Play enforces them.

---

## 0. Checks before you start

1. **Upload key:** Test and release → **App integrity** → App signing.
   The **upload key certificate SHA-1** must be:
   ```
   32:42:F2:22:74:0B:78:6D:93:2D:2E:79:2C:8E:33:02:F8:C8:F7:A9
   ```
   If it differs, stop: the bundle will be rejected. Request an upload key reset
   from the same page (takes a few days).
2. **Version code:** Test and release → Production → Release history. The new
   build is **versionCode 3, version 2.0.0**. If the live version code is 3 or
   higher, raise `versionCode` in `app.json` and `android/app/build.gradle` first.

## 1. Build the app bundle

Play takes an `.aab`, not an APK. In PowerShell, one line at a time:
```powershell
cd D:\NoWomp-v1\android
.\gradlew bundleRelease
```
The file is `D:\NoWomp-v1\android\app\build\outputs\bundle\release\app-release.aab`.
(No `-PreactNativeArchitectures` here: the bundle must include every CPU type,
and Play delivers the right one to each phone.)

---

## 2. Store listing

**Grow users → Store presence → Main store listing**

**App name** (max 30)
```
NoWomp: Gym Accountability
```

**Short description** (max 80)
```
Show up or explain yourself. Your own health data fact-checks every excuse.
```

**Full description** (max 4000)
```
Most fitness apps reward you for showing up and quietly forget the days you don't. NoWomp is built around the days you don't.

"Womp womp" is the sad trombone that plays after a sorry excuse. NoWomp means: don't womp womp. Don't whine, just show up.

SHOW UP, FOR REAL
• Schedule your workouts. Only scheduled days count, so rest days never hurt your streak.
• Sessions only count when you start them at one of your places: your gym, your home, or where you play sport.
• Sport keeps your streak alive too, and is counted separately from workouts.

SKIPPING IS ALLOWED. SILENCE ISN'T.
• Can't make it? Make an excuse before you skip.
• Miss a workout without a word and the app asks why the next time you open it.
• Freeze tokens, earned every 15-workout streak, protect your streak once.
• No token? Redemption gives you one chance a week to save it.

YOUR EXCUSES, FACT-CHECKED
Connect Health Connect and the Lab checks your excuses against your own body:
"You said 'too tired' but slept 8h 12m with 84% recovery."
• Your weakest weekday and time of day
• How drinks, caffeine, late dinners and stress show up in the next morning's heart rate, HRV and sleep
• Your best time to train
Anxiety, illness and emergencies are never called lies.

RUN EXPERIMENTS ON YOURSELF
Does a later bedtime really hurt your workouts? Run a proper 4-week experiment: rule on, rule off, repeated. A result only counts if it beats your own day-to-day noise and repeats.

THE FUN IS BACK
• 35 pixel-art trophies to collect, plus a hidden Hall of Shame
• A penguin home-screen widget whose mood follows your day. Poke him.
• A super-saiyan celebration with 8-bit sounds every time you finish
• A Sunday recap of your week

YOUR DATA STAYS ON YOUR PHONE
No account. No ads. No analytics. No tracking. Everything is stored on your device, and health data is read on your phone and never leaves it. Backups are a file you save yourself.

The only time NoWomp uses the internet is the map when you add a place: map images and place searches come from OpenStreetMap.

FREE AND OPEN SOURCE
NoWomp is free software (AGPLv3). Read the code, build it yourself, or contribute:
https://github.com/akashkashyaps/nowomp

NoWomp is for general fitness and wellness. It is not a medical device and doesn't give medical advice.
```

**Graphics**
- **App icon** (512×512): `docs/images/play-store-icon.png`
- **Feature graphic** (1024×500): `docs/store/feature-graphic.png`
- **Phone screenshots:** to come after the screenshot session. Upload 4 to 8.

**Category and contact** (Store settings)
- App category: **Health & Fitness**
- Tags: Fitness, Workout tracker, Habit tracker (pick what Play offers)
- Email: `developernowomp@gmail.com`
- Website: `https://github.com/akashkashyaps/nowomp`

---

## 3. App content

**Policy and programs → App content.** Each item below is its own form.

### Privacy policy
Your flycricket URL:
```
https://doc-hosting.flycricket.io/nowomp-privacy-policy/4dc3e839-0361-4540-a557-7897c4d6c05d/privacy
```

### Ads
**No, my app does not contain ads.**

### App access
**All functionality is available without any access restrictions.**
(There's no login. If Play asks for instructions anyway, paste:)
```
No account or login. On first launch, enter any name, then add a place: tap ADD A PLACE, then USE WHERE I AM (or search a location), and save. Workouts can then be started within 200 m of that place. Health features need Health Connect but are optional; everything else works without them.
```

### Content rating
Start the questionnaire and choose the category **All Other App Types**. Answers:
- Violence, sexuality, language, controlled substances, gambling: **No** to all.
  (The app mentions drinks and caffeine only as habits to log, with no
  promotion. If asked about alcohol references, answer that alcohol is
  referenced only as a personal habit-tracking entry, not promoted.)
- Does the app let users interact or exchange content? **No**
- Does the app share the user's location with other users? **No**
- Can users make purchases? **No**
- Is it a web browser or search engine? **No**

Expected rating: Everyone / PEGI 3.

### Target audience and content
- Target age: **18 and over** (health data and location; keeps you outside
  the stricter Families rules).
- Could the app unintentionally appeal to children? **No**. The pixel art is a
  fitness-app style; there's no child-directed content.

### News app
**No**

### Data safety
The only data that leaves the phone is when the user adds a place: the map
area being viewed (map images) and any search text, sent to OpenStreetMap.
Everything else, health data included, stays on the device, so it doesn't
count as "collected" under Play's definitions.

- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes** (HTTPS)
- Do you provide a way for users to request that their data is deleted?
  **No**. NoWomp has no account or server and stores nothing; uninstalling
  deletes everything on the phone.

Data types to tick:

| Data type | Collected | Shared | Ephemeral | Required? | Purpose |
|---|---|---|---|---|---|
| **Location → Approximate location** | Yes | No* | No | Optional | App functionality |
| **App activity → In-app search history** | Yes | No* | No | Optional | App functionality |

\* Not "shared": the user starts the transfer themselves (opening the map,
typing a search) and expects the map service to receive it. That's one of
Play's listed exemptions from "sharing".

Leave **Health and fitness**, **Personal info** and everything else unticked:
health data is read and processed on the device and never transmitted.

### Government apps / Financial features
**No** / **My app doesn't provide any financial features.**

### Health apps declaration
Tick:
- **Activity and fitness**
- **Sleep**

Leave mental health and medical categories unticked. (The journal lets users
log a stress level, but the app offers no mental-health features.)

Answer that the app is **not** a medical device and doesn't diagnose or treat.

### Health Connect permissions
For each permission, Play asks why the app needs it. NoWomp reads
11 types and writes 1:

| Permission | Justification |
|---|---|
| Read heart rate variability | Calculates the daily recovery score shown on the Health tab, and fact-checks "too tired" excuses against how recovered the user actually was. |
| Read resting heart rate | Part of the recovery score, and used to show how habits (late dinners, drinks, caffeine) affect the next morning's resting heart rate. |
| Read heart rate | Shows heart-rate zones and the heart rate trend on the Health tab. |
| Read sleep | Calculates the sleep score and sleep stages chart, and checks "too tired" excuses against last night's sleep. |
| Read steps | Shows daily steps and trends, and powers the distance-based journeys and step trophies. |
| Read distance | Advances the user's distance journeys (e.g. the length of Manhattan, a marathon, to the Moon and back) and shows daily distance. |
| Read total calories burned | Shows daily energy expenditure on the Health tab. |
| Read active calories burned | Shows active energy for each day and workout on the Health tab. |
| Read weight | Shows the user's weight trend on the Health tab. |
| Read exercise | Shows exercise sessions recorded by other apps alongside NoWomp workouts, so the user sees all their training in one place. |
| Write weight | Only when the user logs their weight in NoWomp and turns on "Also save to Health Connect", so the entry appears in their other health apps. Off by default. |

General question ("how does your app use health data?"):
```
NoWomp is a workout accountability app. It reads Health Connect data on the device to calculate recovery and sleep scores, show health trends, and compare the user's stated reasons for skipping workouts with their actual sleep and recovery. All health data is processed and stored only on the device; it is never transmitted, shared or used for advertising.
```

### Foreground service
Type: **Special use**. Description:
```
While the user has a workout running, NoWomp shows an ongoing notification with a live timer so the session keeps counting when the app is in the background or the screen is off. The service starts only when the user taps START WORKOUT and stops when they tap END WORKOUT. It reads no sensors and records nothing besides the workout's start and end time.
```
Play may ask for a **video**. Record your screen (about 20 seconds): open
NoWomp → START WORKOUT → go to the home screen → pull down the notification
with the timer → back to NoWomp → END WORKOUT. Upload it to YouTube as
**Unlisted** and paste the link.

### Exact alarms
NoWomp uses `SCHEDULE_EXACT_ALARM` (not `USE_EXACT_ALARM`), which normally
needs no declaration. If Play asks anyway:
```
Workout reminders must fire at the exact time the user scheduled their workout (and before redemption deadlines). A delayed reminder defeats the app's core accountability feature.
```

---

## 4. Release

**Test and release → Production → Create new release**

1. Upload `app-release.aab`.
2. Release name: `2.0.0`
3. **Release notes** (max 500, en-US):
```
NoWomp 2.0 is a big one:
• The Lab: your excuses fact-checked by your own sleep and recovery
• 4-week self-experiments with honest results
• 35 pixel-art trophies and a Hall of Shame
• A penguin widget whose mood follows your day
• Gym, home and sport places, picked on a map
• Sport counts toward your streak, tracked separately
• Redesigned Settings, guided tours and a Sunday recap
• New pixel-art icon and 8-bit sounds
Still offline. Still no account, no ads.
```
4. **Next → Save → Send for review.** Choose a **staged rollout of 20%**
   first; raise it to 100% after a few days if no crashes show up in
   **Quality → Android vitals**.

Reviews of updates with new permissions (Health Connect, foreground service)
usually take 1–7 days.
