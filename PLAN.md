# Tropa — Implementation Plan

Offline, hands-free Tagalog/Taglish voice assistant for motorcycle riders.
Target: Android 7.0+ (API 24), 4 GB RAM phones, zero network calls at runtime.
**Free-only policy:** every library, model and service must be free with no account, no API key and no runtime internet. (Porcupine is excluded because it needs a Picovoice AccessKey.)

## 0. Current state of the repo (`/home/wenz/Documents/Tropa`)

- Fresh `create-expo-app` starter: Expo SDK **57**, React Native **0.86.3**, React 19.2, `expo-router` ~57, `typedRoutes` + `reactCompiler` on.
- Routes live in `src/app/` (`_layout.tsx`, `index.tsx`, `explore.tsx`) with `NativeTabs` in `src/components/app-tabs.tsx`.
- Path alias `@/*` -> `src/*`. No `ios/` or `android/` folders (Continuous Native Generation). Native changes go through `app.json` + config plugins only.
- `AGENTS.md` rules we must follow:
  - Expo APIs have changed. Check the versioned docs (`https://docs.expo.dev/versions/v57.0.0/`) before using any Expo/RN API.
  - Install with `npx expo install <pkg>`.
  - Run `npx expo lint` and `npx tsc --noEmit` before calling anything done.
  - Never hand-edit native folders.
- App name stays **Tropa** (confirmed). "Yah" from the original spec is just one of the wake words, not the app name.

## 0.1 Decisions confirmed (update)

- **App name:** Tropa (`app.json` already correct; keep slug/scheme).
- **Language:** the app must *understand* Tagalog/Taglish (Whisper `language="tl"`, Tagalog keyword rules, Qwen few-shots). It does NOT need to *speak* Tagalog. Replies are short English sentences via TTS `en-US`. Consequences:
  - No dependency on a fil-PH TTS voice (removes a risk on low-end phones).
  - `timeToTagalog.ts` becomes optional; replace with `timeToEnglish.ts` ("4:45 in the afternoon"). Keep the Tagalog formatter as a low-priority extra (settings: reply language English / Tagalog) since the original spec asked for it.
  - Qwen `reply` field becomes English, max 10 words. Prompt and few-shots: Tagalog/Taglish input -> English reply.
  - Confirmations in English ("Calling Kuya Ben, okay?") but the yes/no listener accepts both: oo, opo, sige, ok, yes / hindi, huwag, wag, no, cancel.
- **Wake words:** keep yah, kuya, tol, bai, hoy yah (+ variants) and add **tropa** as a default (it is the app name). Still editable in settings.
- **Older Android support:** target **Android 7.0 (API 24)** as minimum. See section 9.
- Other defaults from section 8 still assumed unless you say otherwise (Vosk, Jest, sideloaded APK).
- **Detector (decided):** Vosk default, sherpa-onnx keyword spotting as alternative, VAD-only as test fallback. Porcupine removed (needs a key).
- **Reply text is English everywhere** ("Yes?", "Please say that again", "Sorry, I didn't understand"). Any older Tagalog reply strings in this file or the spec are superseded.
- **Models (decided):** downloaded on the phone itself during Setup, over Wi-Fi by default, from pinned Hugging Face URLs (whisper.cpp `ggml-tiny.bin` / `ggml-base.bin`, unsloth `Qwen3-0.6B-Q4_K_M.gguf`). Each file is checked for exact size and SHA-256 before it is used. Importing from local files is an optional extra, not required. The download code is the only network code in the app.

## 1. Architecture

```
src/
  app/                      Expo Router screens (routes only)
    _layout.tsx
    index.tsx               Home
    settings.tsx            Settings
    setup.tsx               First-launch model download / import
    debug.tsx               Debug screen
  core/
    pipeline/
      orchestrator.ts       State machine: idle > triggered > recording > stt > verify > intent > act > speak > idle
      states.ts
    audio/
      ringBuffer.ts         4 s pre-roll PCM ring buffer
      recorder.ts           Capture + endpointing (1 s silence / 6 s max)
      vad.ts                Energy/VAD gate + speech probability
      beep.ts
      ducking.ts            Audio focus ducking
    detector/
      types.ts              WakeDetector interface
      voskDetector.ts       Grammar-restricted keyword spotting (default)
      sherpaDetector.ts     sherpa-onnx keyword spotting (alternative, free)
      energyFallback.ts     VAD-only detector (always over-triggers; testing)
    stt/
      whisperService.ts     Load > transcribe > release, language "tl"
    wake/
      wakeWords.ts          Defaults + Whisper spelling variants
      fuzzyMatch.ts         Levenshtein + phonetic normalisation
      verify.ts             First 1-2 words vs list, strip wake word
    intents/
      types.ts              Intent union + ParsedCommand
      rules.ts              Keyword rules (no LLM)
      llmParser.ts          Qwen load > parse > release
      prompt.ts             System prompt + 25+ few-shots
      grammar.ts            GBNF JSON grammar
      handlers/             One file per intent
    tts/
      speak.ts              en-US default (optional fil-PH if installed), pauses detector
    format/
      timeToEnglish.ts      HH:mm > "4:45 in the afternoon"
      dateToEnglish.ts
    tagalog/                OPTIONAL, low priority (reply-language setting)
      timeToTagalog.ts      HH:mm > Tagalog
      dateToTagalog.ts
    system/
      contacts.ts  call.ts  sms.ts  location.ts  battery.ts  media.ts
    service/
      foregroundService.ts  Persistent notification + mute action
    logging/
      triggerLog.ts         Local JSONL log, toggle
      metrics.ts            Step timings, false-triggers/hr, battery drain, RAM
    settings/
      store.ts              Persisted settings
    models/
      manager.ts            Download (Wi-Fi) / import / verify checksum
  components/               UI (dark, large touch targets)
  constants/
__tests__/
  timeToEnglish.test.ts
  timeToTagalog.test.ts     (only if the optional Tagalog formatter is built)
  verify.test.ts
  rules.test.ts
  phrases.test.ts           40-phrase script
docs/
  TEST_SCRIPT.md
README.md
```

Rule: keep `src/app/` for routes only (per AGENTS.md); all logic lives in `src/core/`.

## 2. Pipeline (matches spec)

1. Always-on: mic > ring buffer (4 s) + VAD + keyword spotter (Vosk grammar `["yah","ya","kuya","tol","bai","tropa","hoy yah","[unk]"]`, or sherpa-onnx keywords). Sensitivity HIGH, over-triggering allowed.
2. Possible trigger: soft beep > keep recording until ~1 s silence or 6 s max. Clip = pre-roll + live audio.
3. Whisper tiny (`language="tl"`) on the full clip.
4. Verify: fuzzy-match first 1-2 words against wake list. No match -> discard silently (no beep, no reply). Match -> strip wake word.
5. Empty command -> say "Yes?" and record one more short clip.
6. Rules first, Qwen only if no rule matches > execute > short reply via TTS > resume detector.

Cross-cutting: detector paused while TTS speaks, clips < 0.5 s or low speech probability ignored, low Whisper confidence -> "Please say that again", music ducked while listening/speaking, mute button and notification stop-mic action.

## 3. Memory strategy (4 GB)

Only the detector is resident. Sequence per trigger: load Whisper > transcribe > release > (rules match? skip Qwen) > else load Qwen (n_ctx 1024, n_predict 64, temp 0, `/no_think`, GBNF) > release > TTS. Settings flag "keep model loaded" for phones with headroom. Debug screen reports RAM and per-step time to tune this.

## 4. Library choices — TO BE VERIFIED against SDK 57 / RN 0.86 before installing

| Need | Candidate | Risk |
|---|---|---|
| LLM | `llama.rn` | Must support RN 0.86 / new arch; check GBNF grammar option names |
| STT | `whisper.rn` | Same; check how it takes raw PCM/WAV and exposes confidence |
| Keyword spotting | `react-native-vosk` (grammar, default) or sherpa-onnx RN binding (alternative) | Vosk and Whisper both want the mic: need ONE capture source feeding both. sherpa-onnx may need a custom native module (no official Expo module known; verify) |
| Mic capture to PCM | `react-native-live-audio-stream` or whisper.rn realtime/VAD helpers | Must run in foreground service with screen off |
| TTS | `expo-speech` | Uses the phone's built-in engine (free, offline). en-US voice data may need to be installed on some phones; detect and warn |
| Foreground service | notifee or `react-native-background-actions` + config plugin for `FOREGROUND_SERVICE_MICROPHONE` | Android 14+: mic FGS must start while app is visible |
| Contacts | `expo-contacts` | none |
| Location | `expo-location` | last-known fix cached while running |
| Battery | `expo-battery` | none |
| Direct call | native module or `react-native-immediate-phone-call` | `Linking.openURL("tel:")` only opens dialer; CALL_PHONE needed for direct dial |
| Silent SMS | native module (e.g. `react-native-get-sms-android`) | Expo SMS only opens composer; silent send needs custom module. Google Play restricts SEND_SMS, so sideload/dev build only |
| Media control / volume / ducking | native module for MediaSession key events + AudioManager focus | `expo-audio` does not control other apps' players |
| Fuzzy match | write ourselves (small) | none |
| Files / storage | `expo-file-system` | check SDK 57 API (new File/Directory API) |

Several of these need a small custom Expo module (local config plugin + Kotlin). That is allowed through `app.json` plugins but must not be done by hand-editing `android/`.

## 5. Milestones

- **M0** Verify and scaffold: confirm lib compatibility, set package id + minSdk 24, install deps, config plugin + permissions, dev build runs.
- **M1** Vertical slice: "Yah anong oras na ba" end to end (detector > Whisper > verify > tell_time > TTS), with pure-logic pieces unit-tested first.
- **M2** Remaining no-LLM intents (date, battery, music, volume, next).
- **M3** Qwen parser + GBNF + few-shots + fallback to "Sorry, I didn't understand".
- **M4** call_contact with voice confirmation, sos_alert with countdown/cancel/SMS.
- **M5** Reliability: ducking, mute, notification action, logging, low-confidence handling, optional headset button.
- **M6** Screens: Home, Settings, Setup (model download/import), Debug.
- **M7** Docs and tests: README, 40-phrase test script, English time-format unit tests (Tagalog ones if built), low-RAM test guide.

## 6. Testing strategy

- Pure logic (time/date formatting, fuzzy wake match, keyword rules, JSON parsing) tested with Jest, no device needed.
- 40-phrase table drives `verify` + `rules` tests and doubles as the manual script (`docs/TEST_SCRIPT.md`).
- Device testing: low-RAM phone (or emulator capped to 4 GB), screen-off test, airplane-mode test, idle battery drain, false-trigger count per hour.

## 7. Safety rules baked into design

- Never guess on call or SOS: unknown/low-confidence/parse failure -> "Sorry, I didn't understand".
- Calls require an explicit yes ("oo", "opo", "sige", "yes") before dialing; SOS always has a 5 s cancelable countdown.
- No network calls at runtime; models only fetched in Setup or imported from local files. Add a build-time check that no `fetch` runs outside the Setup module.

## 8. Open decisions (need your answer)

1. ~~Rename Tropa -> Yah?~~ RESOLVED: keep Tropa.
2. ~~Detector default~~ RESOLVED: Vosk default, sherpa-onnx alternative, VAD-only fallback. Porcupine dropped (needs key).
3. **Android package id**, proposed `com.wenz.tropa`.
4. **Test runner:** add Jest (`jest-expo`) now? Plan assumes yes.
5. **Play Store?** Silent SEND_SMS/CALL_PHONE are restricted by Google Play. Plan assumes sideloaded APK only.

## 9. Supporting older Android

**Floor: Android 7.0 (API 24).** Expo SDK 57 apps get `minSdkVersion = 24` from the root project, and React Native 0.86 needs it too, so going below 7.0 is not possible with this SDK. Android 5/6 phones would need an older Expo SDK, which would also drop the newer llama.rn/whisper.rn builds. Not recommended.

What "older" means for each feature (all must degrade gracefully, never crash):

| Area | Android 7-9 (API 24-28) | Android 10-12 | Android 13+ / 14+ |
|---|---|---|---|
| Notification permission | Not needed (always allowed) | Not needed | Runtime `POST_NOTIFICATIONS` |
| Foreground service | Plain foreground service works | Same | Android 14 requires declared type `microphone` and starting while app is visible |
| Notification channel | Channels exist from API 26; API 24-25 needs a non-channel notification path | OK | OK |
| Runtime permissions | Dangerous perms are runtime from API 23, so OK | OK | OK |
| Background mic with screen off | Works with foreground service | Android 11+ limits background mic start; start service from the UI | Same, plus 14 rules |
| Audio focus / ducking | Use legacy `AudioManager.requestAudioFocus` on < API 26, `AudioFocusRequest` on 26+ | OK | OK |
| Contacts / SMS / Call | OK | OK | OK (SMS/Call stay sideload-only) |
| Battery saver / OEM kill | Aggressive on Xiaomi/Oppo/Vivo/Samsung old builds: add "disable battery optimization" prompt + guide | Same | Same |

**Biggest practical limit is CPU/ABI, not the Android version.** `llama.rn` and `whisper.rn` run best on **arm64-v8a**. Old Android 7-8 phones are often 32-bit **armeabi-v7a**, much slower and not always supported by the prebuilt binaries. Plan:
- Build arm64-v8a first; test whether armeabi-v7a is shipped by the libs. If not, document it as unsupported.
- Expect Whisper tiny + Qwen 0.6B to be slow on old CPUs. Mitigations: rules-first (skip Qwen), Whisper tiny only, short clips, optional "fast mode" that disables the LLM entirely (rules only).
- Add a device-capability check at first launch (ABI, RAM, API level) and show a clear warning in Setup instead of failing later.

Expo config to set (via `expo-build-properties` plugin in `app.json`, not by editing `android/`): `android.minSdkVersion: 24` explicitly, and keep `targetSdkVersion` at the SDK default. Verify the exact option names in the SDK 57 docs before writing it.

Test matrix: one Android 7/8 phone, one Android 10/11, one Android 13/14. Minimum: run the idle detector for 30 min screen off on each.
