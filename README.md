# Tropa

Offline, hands-free **Tagalog / Taglish voice assistant for motorcycle riders** (Android).

Say a wake word and a command, for example **"Yah, anong oras na ba?"**, and Tropa answers out loud in English. After the one-time model download it runs **fully offline**: no account, no API key, no internet while riding.

> **Status: in development, not yet tested on a real phone.** The logic is unit-tested (345 tests), but the first device build has not been run yet. See [TASKS.md](TASKS.md) for exactly what is done and what is not.

## What it can do

| Say (examples) | What happens | Status |
|---|---|---|
| "Yah anong oras na" / "Kuya what time is it" | Tells the time | Ready |
| "Hoy yah anong petsa ngayon" | Tells the date | Ready |
| "Tol ilang porsyento na baterya" | Battery level | Ready |
| "Yah tawagan si Kuya Ben" | Asks "Calling Kuya Ben, okay?", dials only after you say "oo" / "yes" | Ready (needs device test) |
| "Kuya tulong" / "Yah naaksidente ako" / "SOS" | 5-second countdown (say "cancel" to stop), then texts your emergency contacts with your last location | Ready (needs device test) |
| "Yah ulitin mo" | Repeats the last reply | Ready |
| "Kuya patugtog" / "sunod" / "lakasan" | Music and volume control | Recognised, not wired to the player yet |

**Wake words:** yah, kuya, tol, bai, hoy yah, tropa (editable in Settings). The wake word must be one of the first two words, so "sabi ni kuya..." in normal conversation is ignored.

**Safety:** Tropa never guesses on calls or SOS. If it is unsure it says "Sorry, I didn't understand".

## How it works

```
mic (always on) > wake detector > beep > record until silence
  > Whisper (speech to text, Tagalog) > check wake word
  > keyword rules (fast) or Qwen 0.6B (only if no rule matches)
  > do the action > speak the reply (English TTS)
```

- Speech to text: [whisper.rn](https://github.com/mybigday/whisper.rn) with the multilingual Whisper tiny/base model
- Command parsing: keyword rules first, then [llama.rn](https://github.com/mybigday/llama.rn) with Qwen3 0.6B (Q4_K_M)
- Mic, direct call, silent SMS, foreground service, audio ducking: local Expo module in `modules/tropa-native` (Kotlin)
- Built with Expo SDK 57, React Native 0.86, Expo Router

## Requirements

**Phone**
- Android 7.0 (API 24) or newer, 64-bit (arm64-v8a) recommended
- About 4 GB RAM
- About 500 MB free storage for the models (Whisper tiny 74 MB + Qwen 378 MB; Whisper base is 141 MB)
- Wi-Fi once, for the model download in Setup

**Computer (to build)**
- [Node.js](https://nodejs.org/) 20.19.4 or newer and npm
- [Git](https://git-scm.com/)
- One of:
  - **EAS cloud build** (easiest, no Android Studio needed): a free [Expo account](https://expo.dev/signup)
  - **Local build**: [Android Studio](https://developer.android.com/studio) with Android SDK + NDK 27.1.12297006, and JDK 17

> Expo Go does **not** work for this app: it needs its own native code (Whisper, Qwen, mic, calls, SMS). You must install a development build.

## Install

```bash
git clone https://github.com/wencylacasa/Tropa.git
cd Tropa
npm install
```

Add new packages with `npx expo install <package>` (not `npm install <package>`), so the versions match Expo SDK 57.

## Build and run on a phone

### Option A: EAS cloud build (recommended)

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android
```

When the build finishes, open the link on your phone and install the APK. Then on your computer:

```bash
npx expo start --dev-client
```

Open the Tropa app on the phone; it connects to the dev server (same Wi-Fi network).

To build a standalone APK for riding (no computer or dev server needed):

```bash
npx eas-cli@latest build --profile preview --platform android
```

Build profiles are in [eas.json](eas.json). `preview` and `production` produce an `.apk` because Tropa is sideloaded, not published on the Play Store.

### Option B: local build

1. Install Android Studio, then the SDK and **NDK 27.1.12297006** (SDK Manager > SDK Tools).
2. Set `ANDROID_HOME` to your SDK folder (e.g. `C:\Android\Sdk`).
3. Connect the phone with USB debugging on, then:

```bash
npm run android
```

This runs `expo run:android`, which generates the `android/` folder and installs the app.

> **Windows:** keep the project **and** the Android SDK in paths **without spaces** (e.g. `C:\dev\Tropa`, `C:\Android\Sdk`). With spaces the C++ build of the native libraries fails at the link step.

The `android/` and `ios/` folders are generated (Continuous Native Generation) and are not committed. Change native settings in `app.json` or the config plugins, never by editing `android/` by hand.

## First launch

1. **Setup** screen opens automatically.
2. Tap **Download** for each model (Wi-Fi recommended; it asks before using mobile data). Each file is checked for exact size and SHA-256 before it is used.
3. Grant permissions: **Microphone** (required), Notifications, Contacts (for calling), Location (for SOS), and turn off battery optimization so it keeps listening with the screen off.
4. Tap **Continue**. Home shows `Naghihintay ng "Yah"` and Tropa is listening.

## Using Tropa

- **Home**: current status, what it last heard, last action and how long it took, last reply.
- **Mute button**: turns the microphone completely off. The notification's **Stop mic** button does the same.
- **Settings** (gear icon):
  - Wake words (add/remove)
  - Whisper tiny (fast) or base (more accurate)
  - LLM on/off (off = keyword rules only, faster and lighter)
  - Keep model loaded (faster, uses more RAM)
  - Emergency contacts for SOS (up to 5)
  - Trigger logging (saves every attempt to `trigger_logs.jsonl` for tuning)

A full list of phrases to try, with the expected result, is in [docs/TEST_SCRIPT.md](docs/TEST_SCRIPT.md).

## Development

```bash
npm test             # unit tests (Jest)
npx tsc --noEmit     # typecheck
npx expo lint        # lint
npx expo-doctor      # check dependencies and config
```

Run typecheck, lint and tests before committing.

```
src/
  app/            screens (Expo Router): index (Home), setup, settings
  core/
    app/          runtime, real adapter wiring, status store
    audio/        mic hub, pre-roll buffer, VAD, recorder
    detector/     wake detectors
    stt/          Whisper service
    intents/      rules, Qwen parser, prompt, grammar, handlers
    pipeline/     orchestrator state machine
    models/       model specs, downloader, checksum
    settings/     persisted settings
    system/       contacts, call, SMS, location, battery, permissions
    tts/          text to speech
    wake/         wake words and fuzzy matching
modules/tropa-native/   Kotlin module: mic, call, SMS, foreground service, audio focus
__tests__/        unit tests
docs/             test script
```

Plans and progress: [PLAN.md](PLAN.md) (design) and [TASKS.md](TASKS.md) (checklist).

## Notes

- **Play Store:** silent SMS and direct calling (`SEND_SMS`, `CALL_PHONE`) are restricted by Google Play, so Tropa is meant to be sideloaded (installed from the APK).
- **Privacy:** audio is processed on the phone and never uploaded. The only network use is the model download in Setup.

## License

MIT, see [LICENSE](LICENSE).
