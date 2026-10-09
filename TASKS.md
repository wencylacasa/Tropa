# Yah — Task List

Legend: [ ] todo, [x] done. Work top to bottom; each milestone ends with `npx tsc --noEmit` and `npx expo lint`.

## M0 — Verify and scaffold
- [x] Decision: app name stays Tropa (no rename)
- [x] Decision: replies in English (understand Tagalog/Taglish, speak English via en-US TTS)
- [x] Decision: minimum Android 7.0 (API 24), the floor for Expo SDK 57 / RN 0.86
- [x] Decision: detector = Vosk default, sherpa-onnx alternative, VAD-only test fallback (Porcupine dropped, needs a key)
- [x] Answer remaining open decisions in PLAN.md section 8 (assumed: com.wenz.tropa, Jest, sideload only)
- [x] Set `minSdkVersion: 24` through `expo-build-properties` (option name verified in SDK 57 docs)
- [ ] Check whether llama.rn / whisper.rn / Vosk ship armeabi-v7a; decide arm64-only vs 32-bit support
- [ ] Add device capability check (ABI, RAM, API level) with warning in Setup
- [ ] Read SDK 57 docs (`docs.expo.dev/versions/v57.0.0/`) + `llms.txt` for: config plugins, `expo-file-system`, `expo-speech`, `expo-contacts`, `expo-location`, `expo-battery`, dev builds
- [ ] Check `llama.rn`, `whisper.rn`, `react-native-vosk`, mic-capture lib for RN 0.86 / new-arch compatibility; pick versions
- [x] Set `android.package` (e.g. `com.wenz.tropa`); keep name/slug/scheme as Tropa
- [ ] Remove starter demo content (explore tab, animated icon, hint row, web badge)
- [ ] Install deps with `npx expo install`
- [x] Add Jest (`jest-expo`) + `npm test` script (installed; `@/` alias mapped; first run pending)
- [x] Add Android permissions in `app.json`: RECORD_AUDIO, READ_CONTACTS, CALL_PHONE, SEND_SMS, ACCESS_FINE_LOCATION, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MICROPHONE, POST_NOTIFICATIONS
- [ ] Add config plugin(s) for foreground service type `microphone`
- [~] Create `src/core/` folder skeleton from PLAN.md (done so far: format, wake, intents/handlers; rest created as each module is built)
- [ ] Confirm `npx expo prebuild --platform android` generates cleanly (then leave `android/` ignored)
- [ ] First dev build installs and launches on a device

## M1 — Vertical slice: "Yah anong oras na ba"
Pure logic first (testable without a device):
- [x] `timeToEnglish.ts` ("4:45 in the afternoon", noon/midnight, 12-hour spoken style) + tests (written, not yet run: needs Jest)
- [ ] (optional, later) `timeToTagalog.ts` + test 16:45 -> "Alas-kuwatro kuwarenta y singko ng hapon", 01:00 "ala-una", 12:00 "alas-dose"; behind a reply-language setting
- [x] `wakeWords.ts` defaults (yah, kuya, tol, bai, hoy yah, tropa) + variants (ya, yah, tol, tols, bay, bai, kuya, kuys)
- [x] `fuzzyMatch.ts` (Levenshtein + phonetic normalisation; 3-letter words rely on the variants list, <3 letters exact only)
- [x] `verify.ts` (first 1-2 words, strip wake word, empty-command flag) + tests (written, not yet run)
- [x] `rules.ts` tell_time rule + tests (written, not yet run); `intents/types.ts` has the 12-intent union
Device pieces:
- [ ] Settings store (persisted)
- [ ] Mic capture > ring buffer (4 s) > VAD
- [ ] Detector interface + Vosk detector (grammar incl. "tropa", HIGH sensitivity)
- [ ] VAD-only fallback detector (for testing without Vosk)
- [ ] Soft beep asset + playback
- [ ] Post-trigger recorder (1 s silence / 6 s max, includes pre-roll) > WAV/PCM
- [ ] Model manager stub (path lookup for Whisper tiny)
- [x] `whisperService.ts` (load > transcribe `language="tl"` > release). Written against whisper.rn types; whisper.rn has NO confidence score, so `sttConfidence.ts` estimates it from the text. Needs on-device test + a model file
- [x] TTS service (`tts/speak.ts`, expo-speech, en-US, timeout guard). Detector pause is handled by the orchestrator. Optional fil-PH voice not done
- [x] Orchestrator state machine (`src/core/pipeline/`), tested against fake ports; real adapters still to be wired
- [ ] Minimal Home screen showing state + last heard text
- [ ] Manual test on device: "Yah anong oras na ba" speaks the time in English

## M2 — Other no-LLM intents
- [x] `dateToEnglish.ts` + tests ("Friday, October 9")
- [x] tell_date handler + rules ("anong petsa", "anong araw ngayon")
- [x] battery_level handler + rules + `system/battery.ts` adapter (expo-battery)
- [ ] Media control native bridge: play/pause/next
- [ ] Volume up/down handler
- [ ] Keyword rules: patugtog, tigil, sunod, hinaan, lakasan
- [x] repeat_last (stores last reply)
- [ ] Rules unit tests

## M3 — Qwen parser
- [ ] Obtain Qwen3 0.6B Q4_K_M GGUF (for local import)
- [ ] `grammar.ts` GBNF JSON grammar (intent enum, target string|null, reply string)
- [ ] `prompt.ts` system prompt + 25+ few-shots (all 12 intents, Tagalog/Taglish input, English `reply` max 10 words)
- [ ] `llmParser.ts` (n_ctx 1024, n_predict 64, temp 0, `/no_think`, load > parse > release)
- [ ] Safe JSON parse + validation; failure -> unknown -> "Sorry, I didn't understand"
- [ ] Never-guess guard for call_contact and sos_alert (require rule-level or high-confidence match)
- [ ] Rules-first dispatcher: Qwen only if no rule matches
- [ ] Tests with mocked LLM output

## M4 — Call and SOS
- [ ] Contacts permission flow + contact cache
- [ ] Fuzzy name match (handles "Kuya Ben", "Ben", "Ate ...") + tests
- [x] Voice confirmation parser: yes/no in both languages, ambiguous = not confirmed (`yesNo.ts`); the spoken "Calling Kuya Ben, okay?" flow is still to do
- [ ] Direct call via CALL_PHONE (native module)
- [ ] Emergency contacts in settings
- [ ] Location: keep last GPS fix cached
- [ ] SOS triggers: "tulong", "naaksidente ako", "SOS"
- [ ] 5-second voice countdown with "cancel" listening
- [ ] Silent SMS send with last location (native module) to all emergency contacts
- [ ] Tests for SOS/call state machines (timers mocked)

## M5 — Riding reliability
- [ ] Foreground service + persistent notification
- [ ] Notification action: stop mic completely
- [ ] Mic works with screen off (verify on device)
- [ ] Audio ducking while listening/speaking
- [ ] Ignore clips < 0.5 s or low speech probability
- [ ] Low Whisper confidence -> "Please say that again"
- [ ] Unknown / parse failure -> "Sorry, I didn't understand"
- [ ] Foreground service works on API 24-25 (no channels) and API 26+ (channels)
- [ ] Legacy audio focus path for API < 26
- [ ] Battery-optimization exemption prompt + OEM guide (Xiaomi/Oppo/Vivo/Samsung)
- [ ] Trigger log (JSONL: wake accepted/rejected, transcript, intent, latency) + on/off toggle
- [ ] Optional: sherpa-onnx keyword detector as alternative (selectable in settings)
- [ ] Optional: Bluetooth headset media button / volume key trigger
- [ ] Handle phone-call interruptions and audio focus loss
- [ ] Static check: no network calls outside Setup

## M6 — Screens (dark theme, large touch targets)
- [ ] Theme: force dark, big buttons (min ~72 dp)
- [ ] Home: status text ("Naghihintay ng 'Yah'" / Listening / Thinking / Speaking), last heard, last action, big mute-mic button
- [ ] Settings: wake word list editor, detector type + sensitivity, Whisper tiny/base, keep-model-loaded, emergency contacts, TTS voice, debug toggle, logging toggle
- [ ] Setup: Wi-Fi download with progress + resume, import from local files, checksum verify, "ready for airplane mode" state
- [ ] First-launch gate (redirect to Setup until models present)
- [ ] Debug: RAM, time per step, false triggers/hour, battery drain estimate
- [ ] Replace native tabs with a layout suited to this app

## M7 — Docs and tests
- [ ] `docs/TEST_SCRIPT.md`: 40 Tagalog/Taglish phrases with expected result (with/without wake word, "kuya" in normal conversation, noise cases); spoken replies are English
- [ ] Android version test matrix: Android 7/8, 10/11, 13/14 (30 min idle screen-off each)
- [ ] `phrases.test.ts` automating the verify + rules part of those 40
- [ ] README: build steps (EAS + local dev build), permissions table, model setup, low-RAM test procedure, airplane-mode test, screen-off test
- [ ] Final `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`, `npm test`
