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
- [x] Add Jest (`jest-expo`) + `npm test` script (installed; `@/` alias mapped; first full run passed)
- [x] Add Android permissions in `app.json`: RECORD_AUDIO, READ_CONTACTS, CALL_PHONE, SEND_SMS, ACCESS_FINE_LOCATION, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MICROPHONE, POST_NOTIFICATIONS
- [ ] Add config plugin(s) for foreground service type `microphone`
- [~] Create `src/core/` folder skeleton from PLAN.md (done so far: format, wake, intents/handlers; rest created as each module is built)
- [ ] Confirm `npx expo prebuild --platform android` generates cleanly (then leave `android/` ignored)
- [ ] First dev build installs and launches on a device

## M1 — Vertical slice: "Yah anong oras na ba"
Pure logic first (testable without a device):
- [x] `timeToEnglish.ts` ("4:45 in the afternoon", noon/midnight, 12-hour spoken style) + tests (passing)
- [ ] (optional, later) `timeToTagalog.ts` + test 16:45 -> "Alas-kuwatro kuwarenta y singko ng hapon", 01:00 "ala-una", 12:00 "alas-dose"; behind a reply-language setting
- [x] `wakeWords.ts` defaults (yah, kuya, tol, bai, hoy yah, tropa) + variants (ya, yah, tol, tols, bay, bai, kuya, kuys)
- [x] `fuzzyMatch.ts` (Levenshtein + phonetic normalisation; 3-letter words rely on the variants list, <3 letters exact only)
- [x] `verify.ts` (first 1-2 words, strip wake word, empty-command flag) + tests (passing)
- [x] `rules.ts` tell_time rule + tests (passing); `intents/types.ts` has the 12-intent union
Device pieces:
- [x] Settings store (persisted): `core/settings/` (validated JSON in the document dir via expo-file-system, subscribe/update/reset) + tests. Not wired to the orchestrator or any screen yet
- [~] Mic capture > ring buffer (4 s) > VAD (done: `hub.ts`, `preRollBuffer.ts`, `vad.ts`; still missing: a real `RawAudioSource` backed by a mic library)
- [~] Detector interface + Vosk detector (grammar incl. "tropa", HIGH sensitivity) (done: `WakeDetector` interface in `pipeline/states.ts`; Vosk detector not started)
- [x] VAD-only fallback detector (for testing without Vosk): `detector/energyFallback.ts` + tests
- [ ] Soft beep asset + playback
- [x] Post-trigger recorder (1 s silence / 6 s max, includes pre-roll): `audio/recorder.ts` + tests; `includePreRoll: false` for the clip after "Yes?". Outputs a 16 kHz Float32 clip
- [x] Model manager: `core/models/manager.ts` (path lookup for Whisper tiny/base + Qwen; only an exact-size file counts as installed; flags English-only Whisper; `readiness()` for the first-launch gate) + tests. Files live in `<document dir>/models/`: `ggml-tiny.bin`, `ggml-base.bin`, `Qwen3-0.6B-Q4_K_M.gguf`. Sizes, SHA-256 and pinned Hugging Face URLs come from the HF API (ggerganov/whisper.cpp, unsloth/Qwen3-0.6B-GGUF). Still to confirm on device: whisper.rn accepting the plain path
- [x] Model downloader (the on-device download): `core/models/download.ts` + `sha256.ts` + tests. Wi-Fi gate (mobile data only if allowed), downloads to `<file>.part`, checks exact size then streaming SHA-256, only then renames into place; cancel via AbortSignal. Native adapter `fileModelFiles.ts` (expo-file-system download task) is NOT unit-tested
- [ ] Downloader on device: confirm the HF redirect to its CDN is followed, time the JS SHA-256 on an old phone (offer `skipChecksum` if too slow), and decide on resume across app restarts (not implemented: a failed or killed download restarts from zero)
- [ ] Wi-Fi check adapter for `NetworkGate` (needs `npx expo install expo-network`; read the SDK 57 docs first)
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
- [x] Keyword rules: patugtog, tigil, sunod, hinaan, lakasan (in `intents/rules.ts`; handlers still need the native media/volume bridge)
- [x] repeat_last (stores last reply)
- [x] Rules unit tests (media/volume cases added to `__tests__/rules.test.ts`)

## M3 — Qwen parser
- [x] Obtain Qwen3 0.6B Q4_K_M GGUF: downloaded on the device in Setup (pinned URL + SHA-256 in `core/models/manager.ts`)
- [x] `grammar.ts` GBNF JSON grammar (intent enum, target string|null, reply string) (built from `INTENTS`; still to verify on device that llama.rn accepts it)
- [x] `prompt.ts` system prompt + 29 few-shots (all 12 intents, Tagalog/Taglish input, English `reply` max 10 words). WARNING: roughly 1,200+ tokens, more than n_ctx 1024; raise n_ctx to 2048 or trim shots once measured on device
- [x] `llmParser.ts` (`LlmParser` class, `port()` returns the dispatcher's `LlmPort`): load > clearCache > completion (GBNF grammar, n_predict 64, temp 0, `enable_thinking: false`, `/no_think` in the prompt) > release unless `keepLoaded`. Default n_ctx is 2048 (not 1024) because the prompt is ~1,200+ tokens. Tests in `__tests__/llmParser.test.ts` with llama.rn mocked. NOT RUN yet. On device: confirm `grammar` is honoured together with `messages` + jinja (if the Qwen3 chat format overrides it, pass `jinja: false` or format the prompt with `getFormattedChat`), measure real prompt tokens and time per command
- [x] Safe JSON parse + validation; failure -> unknown -> "Sorry, I didn't understand" (`intents/llmOutput.ts` `parseLlmOutput`)
- [x] Never-guess guard for call_contact and sos_alert (`guardLlmCommand`: SOS needs an explicit SOS word, call needs the target heard in the transcript)
- [x] Rules-first dispatcher: Qwen only if no rule matches (`intents/dispatcher.ts`, LLM injected as a port)
- [x] Tests with mocked LLM output (`llmOutput.test.ts`, `dispatcher.test.ts`)

## M4 — Call and SOS
- [ ] Contacts permission flow + contact cache
- [x] Fuzzy name match (handles "Kuya Ben", "Ben", "Ate ...") + tests (`system/contactMatch.ts`; ties return `ambiguous`, never guesses)
- [x] Voice confirmation parser: yes/no in both languages, ambiguous = not confirmed (`yesNo.ts`)
- [x] Call flow logic: `system/callFlow.ts` + `callFlow.test.ts` (match > "Calling Kuya Ben, okay?" > one retry on unclear > returns `{ reply, dial }`; dial is set only after an explicit yes; ties, no match, empty contacts and listen failures never dial). Pure logic, NOT yet run or wired
- [x] Dedicated call rule in `rules.ts` ("tawagan si kuya ben", "call ben" > call_contact + target, no Qwen) + tests in `rules.test.ts`. Not run yet
- [x] Wire call flow into the orchestrator: optional `contacts` (`ContactSource`) + `dialer` (`Dialer`) ports in `pipeline/states.ts`; `confirm` = speak prompt > record (`includePreRoll: false`) > STT > `parseYesNo`; a too-short or low-confidence answer counts as `unknown` (never confirms); speak `reply`, then dial; dialer failure speaks "Sorry, I couldn't place the call"; without both ports call_contact is "not understood". 7 new tests in `orchestrator.test.ts`. NOT RUN yet: run `npm test`, `npx tsc --noEmit`, `npx expo lint`. Note: `minClipMs` 300 may drop a very short "oo"; that retries once then cancels (safe), tune on device
- [x] `ContactSource` adapter: `system/contactSource.ts` (pure: raw rows > dialable contacts, prefers mobile/cell, drops contacts with no name or number, 10 min cache, denied/empty never cached, one shared read for overlapping calls) + `system/contacts.ts` (expo-contacts SDK 57 object API: `Contact.getAllDetails([FULL_NAME, PHONES])`, `getPermissionsAsync`, change listener invalidates the cache). `Contact` in `contactMatch.ts` now has an optional `phone`. Tests: `__tests__/contactSource.test.ts`. NOT RUN yet (no shell in that session): run `npm test`, `npx tsc --noEmit`, `npx expo lint`. On device: check `fullName` includes prefix/suffix ("Dr. ...") and does not hurt matching, and how long `getAllDetails` takes on a big address book
- [ ] Wire `createExpoContactSource()` into the real `PipelinePorts.contacts` (when the pipeline is assembled) and call `requestContactsPermission()` from the Setup screen
- [ ] `Dialer` adapter (CALL_PHONE native module): must read `contact.phone` and throw if it is missing; `Linking.openURL('tel:')` only opens the dialer, so it is not enough for hands-free
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
- [~] Setup screen: download logic with progress, Wi-Fi gate and checksum verify is done in `core/models/download.ts` (see M1); still to do: the screen itself, resume across restarts, optional import from local files, "ready for airplane mode" state
- [ ] First-launch gate (redirect to Setup until models present)
- [ ] Debug: RAM, time per step, false triggers/hour, battery drain estimate
- [ ] Replace native tabs with a layout suited to this app

## M7 — Docs and tests
- [ ] `docs/TEST_SCRIPT.md`: 40 Tagalog/Taglish phrases with expected result (with/without wake word, "kuya" in normal conversation, noise cases); spoken replies are English
- [ ] Android version test matrix: Android 7/8, 10/11, 13/14 (30 min idle screen-off each)
- [ ] `phrases.test.ts` automating the verify + rules part of those 40
- [ ] README: build steps (EAS + local dev build), permissions table, model setup, low-RAM test procedure, airplane-mode test, screen-off test
- [ ] Final `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`, `npm test`
