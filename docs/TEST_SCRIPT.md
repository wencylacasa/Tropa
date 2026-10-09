# Tropa — 40-phrase test script

Say each phrase to the phone (mounted as on the bike, helmet on if possible) and
check the result. Spoken replies are always English. The wake-word + keyword-rule
part of this table is automated in `__tests__/phrases.test.ts`; keep both in sync.

Before starting: Setup done (models installed, microphone granted), Home shows
`Naghihintay ng "Yah"`. Turn on Settings > Trigger Logging so every attempt lands
in `trigger_logs.jsonl` with transcript, intent and latency.

Result column: what Home shows as "Last action" and what Tropa says.

| # | Say | Expected result |
|---|-----|-----------------|
| 1 | Yah anong oras na ba | tell_time: "It's 4:45 in the afternoon" (current time) |
| 2 | Kuya, what time is it? | tell_time |
| 3 | Tol anong oras na | tell_time |
| 4 | Hoy yah, anong petsa ngayon? | tell_date: "Today is Friday, October 9" |
| 5 | Tropa anong araw ngayon | tell_date |
| 6 | Bai ilang porsyento na baterya ko? | battery_level: "Battery is at NN percent" |
| 7 | Yah, battery | battery_level |
| 8 | Kuya patugtog naman | media_play. Until the media/volume native bridge exists, rows 8-17 answer "Sorry, I didn't understand" (rule matches, no handler yet) |
| 9 | Yah play music | media_play |
| 10 | Tol tigil muna | media_pause |
| 11 | Yah pause | media_pause |
| 12 | Kuya sunod na kanta | media_next |
| 13 | Yah next | media_next |
| 14 | Tol hinaan mo | volume_down |
| 15 | Yah volume down | volume_down |
| 16 | Kuya lakasan mo | volume_up |
| 17 | Yah louder | volume_up |
| 18 | Yah ulitin mo | repeat_last: repeats the previous reply |
| 19 | Kuya, say that again. | repeat_last |
| 20 | Yah tawagan si Kuya Ben | "Calling Kuya Ben, okay?" > say "oo" > call is placed. Say "hindi" > no call |
| 21 | Tol, call Mama. | call flow for "Mama"; unclear answer asks once more, then cancels |
| 22 | Yah tumawag kay Ate Rose | call flow for "Ate Rose"; unknown name > no call |
| 23 | Kuya tulong! | SOS: "SOS triggered. Say cancel to abort." > stay silent > SMS with location to emergency contacts |
| 24 | Yah naaksidente ako | SOS; say "cancel" > "Okay, SOS cancelled.", no SMS |
| 25 | Tropa, SOS! | SOS (no emergency contacts > "You have no emergency contacts set up.") |
| 26 | Yah. | "Yes?" then listens again; say "anong oras na" > tell_time |
| 27 | Hoy yah | "Yes?" then listens again |
| 28 | Ya, anong oras na? | tell_time (Whisper spelling variant) |
| 29 | Kuys anong oras na | tell_time (variant) |
| 30 | Yah, paano pumunta sa Tagaytay? | Qwen: not a supported intent > "Sorry, I didn't understand" |
| 31 | Kuya ang init ngayon no | Qwen > "Sorry, I didn't understand" |
| 32 | Yah call me back | never dials: Qwen > "Sorry, I didn't understand" |
| 33 | Anong oras na ba | no wake word: silently ignored (no beep reply, no speech) |
| 34 | Sabi ni Kuya Ben pupunta siya | "kuya" mid-sentence: silently ignored |
| 35 | Tara na kuya | wake word at the end: silently ignored |
| 36 | Ano ba yan | silently ignored |
| 37 | (silence for 10 s) | nothing happens |
| 38 | (rev the engine / honk) | may beep (over-triggering allowed) but no reply |
| 39 | (wind noise at speed) | may beep but no reply |
| 40 | (music playing loudly from the phone) | no reply; music ducks while Tropa listens/speaks |

With LLM off (Settings > LLM Enabled), rows 30-32 still answer "Sorry, I didn't
understand" (rules only, no Qwen load).

## Extra device checks

- **Screen off:** lock the phone, wait 2 min, say #1. Repeat after 30 min idle.
- **Notification:** the "Tropa" notification is visible while listening; "Stop mic" turns the mic off and Home shows Muted.
- **Mute button:** Home > Mute > say #1 > nothing happens. Unmute > works again.
- **Airplane mode:** turn on airplane mode after Setup, say #1-#7: all work.
- **Low RAM:** with LLM on, say #30 three times in a row; app must not be killed. Note the time per command in "Last action".
