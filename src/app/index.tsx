import { getServices } from '@/core/app/services';
import { useSettings } from '@/hooks/use-settings';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { appLog } from '../core/app/appLog';
import { statusLabel } from '../core/app/status';
import { useOrchestrator } from '../core/pipeline/Provider';
import type { PipelineState } from '../core/pipeline/states';

const ACCENT = '#3B82F6';
const RECORDING = '#34D399';
const DANGER = '#EF4444';
const DIM = '#5B6B7D';

/** One accent for every working state; green only while recording. */
const STATE_COLOR: Record<PipelineState, string> = {
  idle: ACCENT,
  triggered: ACCENT,
  recording: RECORDING,
  stt: ACCENT,
  verify: ACCENT,
  intent: ACCENT,
  act: ACCENT,
  speak: ACCENT,
};

const TWO_PI = Math.PI * 2;

/** Blur melts the orbiting blobs into one orb; syntax differs web vs native. */
const blurStyle =
  Platform.OS === 'web'
    ? ({ filter: 'blur(18px)' } as object)
    : { filter: [{ blur: 18 }] };

/**
 * Swirling colour blobs inside the ring (Siri-style). Each orbits the centre
 * on one of two clocks; multipliers stay integral so the loop never jumps.
 */
const BLOBS: readonly {
  color: string;
  size: number;
  radius: number;
  mult: number;
  clock: 'a' | 'b';
  phase: number;
}[] = [
  { color: '#EC4899', size: 130, radius: 30, mult: 1, clock: 'a', phase: 0 },
  { color: '#22D3EE', size: 112, radius: 34, mult: -1, clock: 'b', phase: 2.1 },
  { color: '#8B5CF6', size: 140, radius: 24, mult: 2, clock: 'a', phase: 4.2 },
];

/** Pipeline stage shown in the stepper under the orb. */
const STEP_INDEX: Record<PipelineState, number> = {
  idle: 0,
  triggered: 1,
  recording: 1,
  stt: 1,
  verify: 1,
  intent: 1,
  act: 1,
  speak: 2,
};

const STEPS = [
  { icon: 'graphic-eq', label: 'Wake word' },
  { icon: 'chat-bubble-outline', label: 'Utos' },
  { icon: 'check', label: 'Sagot' },
] as const;

const LOG_ICONS = ['mic', 'bolt', 'chat-bubble-outline'] as const;
const LOG_TINTS = ['#3B82F6', '#8B5CF6', '#34D399'] as const;

/** HH:MM:SS without Intl — Hermes Intl support varies by RN version. */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const LOG_TAG_COLOR: Record<string, string> = {
  input: '#4d5b6c',
  runtime: '#8A97A6',
  mic: '#34D399',
  stt: '#38BDF8',
  verify: '#FBBF24',
  intent: '#8B5CF6',
  qwen: '#EC4899',
  pipeline: '#4d5b6c',
};

export default function HomeScreen() {
  const router = useRouter();
  const { status, start, toggleMute, submitText } = useOrchestrator();
  const { settings } = useSettings();
  const params = useLocalSearchParams<{ preview?: string }>();
  // ?preview=1 (web only): render the Home UI without installed models. Voice
  // stays off — starting the mic just surfaces the native-module error text.
  const preview = Platform.OS === 'web' && params.preview === '1';
  const ready = getServices().models.readiness(settings).ready || preview;

  const wave = useSharedValue(0);
  const waveB = useSharedValue(0);
  const muteScale = useSharedValue(1);
  const [typedCommand, setTypedCommand] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const logs = useSyncExternalStore(appLog.subscribe, appLog.get, appLog.get);
  const logScroll = useRef<ScrollView>(null);

  // "Off" covers both muted and a mic that failed to start. In web preview
  // the mic can never start, so we show the live animation anyway — the
  // error text below still makes clear the mic isn't real.
  const off = status.muted || (!status.listening && !preview);
  const busy = !off && status.pipeline !== 'idle';
  const color = STATE_COLOR[status.pipeline];
  const stepIndex = off ? -1 : STEP_INDEX[status.pipeline];
  const wakeWord = settings.wakeWords[0]?.word ?? 'yah';

  // Start listening as soon as Setup is done. Starting here (app visible) also
  // satisfies Android 14's rule for microphone foreground services.
  useEffect(() => {
    if (ready) void start();
  }, [ready, start]);

  useEffect(() => {
    if (off) {
      wave.set(0);
      waveB.set(0);
      return;
    }
    wave.set(withRepeat(
      withTiming(TWO_PI, { duration: busy ? 1100 : 2400, easing: Easing.linear }),
      -1,
      false,
    ));
    waveB.set(withRepeat(
      withTiming(TWO_PI, { duration: busy ? 1600 : 3400, easing: Easing.linear }),
      -1,
      false,
    ));
  }, [off, busy, wave, waveB]);

  // Two staggered sonar rings driven by the same wave clock.
  const rippleA = useAnimatedStyle(() => {
    const p = (wave.value / TWO_PI) % 1;
    return {
      opacity: (1 - p) * 0.45,
      transform: [{ scale: 0.72 + p * 0.62 }],
    };
  });

  const rippleB = useAnimatedStyle(() => {
    const p = ((wave.value / TWO_PI) + 0.5) % 1;
    return {
      opacity: (1 - p) * 0.3,
      transform: [{ scale: 0.72 + p * 0.62 }],
    };
  });

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.03 * Math.sin(wave.value) }],
  }));

  const muteStyle = useAnimatedStyle(() => ({
    transform: [{ scale: muteScale.value }],
  }));

  const handleMutePress = () => {
    muteScale.set(withSequence(
      withTiming(0.9, { duration: 80 }),
      withTiming(1, { duration: 120 }),
    ));
    void toggleMute();
  };

  // First-launch gate: stay in Setup until the models this configuration needs are on disk.
  if (!ready) return <Redirect href="/setup" />;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.appName}>Tropa</Text>
            <Text style={styles.appTagline}>hands-free na katropa</Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            style={styles.settingsBtn}
            hitSlop={16}
          >
            <MaterialIcons name="settings" size={20} color="#8A97A6" />
          </Pressable>
        </View>

        {/* Status orb */}
        <View style={styles.orbContainer}>
          {!off ? (
            <>
              <Animated.View style={[styles.glow, blurStyle, { backgroundColor: color + '30' }]} />
              <Animated.View style={[styles.ripple, rippleA, { borderColor: color }]} />
              <Animated.View style={[styles.ripple, rippleB, { borderColor: color }]} />
            </>
          ) : null}
          <Animated.View
            style={[
              styles.orb,
              orbStyle,
              {
                backgroundColor: off ? '#0d1117' : '#0a0f1c',
                borderColor: off ? '#2a3340' : color + 'aa',
              },
            ]}
          >
            {off ? (
              <MaterialIcons
                name="mic-off"
                size={38}
                color={status.muted ? DANGER : DIM}
              />
            ) : (
              <View style={[styles.blobClip, blurStyle]}>
                {BLOBS.map((b) => (
                  <BlobLayer
                    key={b.color}
                    clock={b.clock === 'a' ? wave : waveB}
                    mult={b.mult}
                    phase={b.phase}
                    radius={b.radius}
                    size={b.size}
                    color={b.color}
                  />
                ))}
              </View>
            )}
          </Animated.View>
          <Text style={[styles.stateLabel, { color: off ? '#777' : '#fff' }]}>
            {statusLabel(preview ? { ...status, listening: true } : status, wakeWord)}
          </Text>
          {!off && status.pipeline === 'idle' ? (
            <Text style={styles.hint}>
              Sabihin ang wake word + utos, hal. &quot;{wakeWord}, anong oras na?&quot;
            </Text>
          ) : null}
          {status.error ? (
            <Text style={styles.errorText} numberOfLines={3}>
              {status.error}
            </Text>
          ) : null}

          {/* Pipeline stepper */}
          {!off ? (
            <View style={styles.stepsRow}>
              <View style={styles.stepTrack} />
              <View
                style={[
                  styles.stepTrackFill,
                  { width: Math.max(0, stepIndex) * 80, backgroundColor: color },
                ]}
              />
              {STEPS.map((s, i) => (
                <View key={s.label} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepDot,
                      i <= stepIndex
                        ? { borderColor: color, backgroundColor: color + '33' }
                        : styles.stepDotOff,
                    ]}
                  >
                    <MaterialIcons
                      name={s.icon}
                      size={15}
                      color={i <= stepIndex ? color : '#4d5b6c'}
                    />
                  </View>
                  <Text
                    style={[styles.stepLabel, { color: i <= stepIndex ? '#c4cdd8' : '#4d5b6c' }]}
                  >
                    {s.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Activity Log */}
        <View style={styles.logContainer}>
          {[status.lastHeard ?? '—',
            (status.lastAction ?? '—') +
              (status.lastTimingMs !== null ? `  (${(status.lastTimingMs / 1000).toFixed(1)} s)` : ''),
            status.lastReply ?? '—',
          ].map((value, i) => (
            <View key={LOG_ICONS[i]}>
              {i > 0 ? <View style={styles.logDivider} /> : null}
              <View style={styles.logRow}>
                <View style={[styles.logIcon, { backgroundColor: LOG_TINTS[i] + '26' }]}>
                  <MaterialIcons name={LOG_ICONS[i]} size={18} color={LOG_TINTS[i]} />
                </View>
                <View style={styles.logText}>
                  <Text style={styles.logLabel}>{['Narinig', 'Ginawa', 'Sagot'][i]}</Text>
                  <Text style={styles.logValue} numberOfLines={2}>
                    {value}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Pipeline logs (collapsible) */}
        <Pressable style={styles.logsToggle} onPress={() => setShowLogs((s) => !s)}>
          <MaterialIcons
            name={showLogs ? 'expand-less' : 'expand-more'}
            size={16}
            color="#4d5b6c"
          />
          <Text style={styles.logsToggleText}>
            Logs{logs.length > 0 ? ` (${logs.length})` : ''}
          </Text>
        </Pressable>
        {showLogs ? (
          <ScrollView
            ref={logScroll}
            style={styles.logsPanel}
            onContentSizeChange={() => logScroll.current?.scrollToEnd({ animated: false })}
          >
            {logs.length === 0 ? (
              <Text style={styles.logLineDim}>Walang events pa.</Text>
            ) : (
              logs.map((e, i) => (
                <Text key={i} style={styles.logLine} numberOfLines={2}>
                  <Text style={styles.logTs}>{formatTime(e.ts)} </Text>
                  <Text style={[styles.logTag, { color: LOG_TAG_COLOR[e.tag] ?? '#8A97A6' }]}>
                    [{e.tag}]{' '}
                  </Text>
                  {e.message}
                </Text>
              ))
            )}
          </ScrollView>
        ) : null}

        {/* Typed command input (web only — no mic exists in the browser) */}
        {Platform.OS === 'web' ? (
          <View style={styles.inputPill}>
            <MaterialIcons name="keyboard" size={18} color="#4d5b6c" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              value={typedCommand}
              onChangeText={setTypedCommand}
              placeholder={`Type a command, e.g. "${wakeWord}, anong oras na?"`}
              placeholderTextColor="#4d5b6c"
              returnKeyType="send"
              onSubmitEditing={() => {
                const text = typedCommand.trim();
                if (text) void submitText(text);
                setTypedCommand('');
              }}
            />
            <Pressable
              style={styles.sendCircle}
              onPress={() => {
                const text = typedCommand.trim();
                if (text) void submitText(text);
                setTypedCommand('');
              }}
            >
              <MaterialIcons name="arrow-upward" size={18} color="#fff" />
            </Pressable>
          </View>
        ) : null}

        {/* Mute Button */}
        <View style={styles.muteContainer}>
          <Pressable onPress={handleMutePress}>
            <Animated.View
              style={[
                styles.muteButton,
                muteStyle,
                {
                  backgroundColor: status.muted ? '#1d1114' : '#0d1520',
                  borderColor: status.muted ? DANGER + '66' : '#22304a',
                },
              ]}
            >
              <MaterialIcons
                name={status.muted ? 'mic-off' : 'mic'}
                size={26}
                color={status.muted ? DANGER : ACCENT}
              />
            </Animated.View>
          </Pressable>
          <Text style={[styles.muteHint, status.muted && { color: DANGER }]}>
            {status.muted ? 'Naka-mute — pindutin para makinig ulit' : 'Bukas ang mic'}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** One translucent blob orbiting the ring's centre — part of the Siri-style swirl. */
function BlobLayer({
  clock,
  mult,
  phase,
  radius,
  size,
  color,
}: {
  clock: SharedValue<number>;
  mult: number;
  phase: number;
  radius: number;
  size: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const a = clock.value * mult + phase;
    return {
      transform: [
        { translateX: radius * Math.cos(a) },
        { translateY: radius * Math.sin(a) },
        { scale: 0.8 + 0.35 * (0.5 + 0.5 * Math.sin(a)) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: 0.8,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05070c',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
  },
  // Top Bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 12,
  },
  appName: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  appTagline: {
    fontSize: 12,
    color: '#5a6b7d',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  settingsBtn: {
    padding: 8,
    backgroundColor: '#10151d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1d2632',
  },
  settingsIcon: {
    fontSize: 22,
  },
  // Status orb
  orbContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  ripple: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1.5,
  },
  blobClip: {
    position: 'absolute',
    width: 178,
    height: 178,
    borderRadius: 89,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#ef5350',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  stateLabel: {
    marginTop: 22,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  hint: {
    marginTop: 8,
    fontSize: 13,
    color: '#5a6b7d',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  // Stepper
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 18,
    width: 240,
  },
  stepTrack: {
    position: 'absolute',
    top: 17,
    left: 40,
    right: 40,
    height: 1.5,
    backgroundColor: '#1a2230',
  },
  stepTrackFill: {
    position: 'absolute',
    top: 17,
    left: 40,
    height: 1.5,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
  },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#05070c',
  },
  stepDotOff: {
    borderColor: '#1d2632',
  },
  stepLabel: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  // Log
  logContainer: {
    backgroundColor: '#0b0f16',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1a2230',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 12,
  },
  logIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logText: {
    flex: 1,
  },
  logLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4d5b6c',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  logValue: {
    fontSize: 14,
    color: '#aab7c4',
  },
  logDivider: {
    height: 1,
    backgroundColor: '#16202c',
    marginLeft: 52,
  },
  // Pipeline logs
  logsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    marginBottom: 4,
  },
  logsToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4d5b6c',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  logsPanel: {
    backgroundColor: '#070a10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#141c28',
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 150,
    marginBottom: 14,
  },
  logLine: {
    fontSize: 11,
    color: '#7d8b9a',
    fontFamily: 'monospace',
    lineHeight: 17,
  },
  logLineDim: {
    fontSize: 11,
    color: '#4d5b6c',
    fontFamily: 'monospace',
  },
  logTs: {
    color: '#3d4a5a',
  },
  logTag: {
    fontWeight: '700',
  },
  // Typed command (web preview)
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0b0f16',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#1a2230',
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: '#e8edf2',
    fontSize: 14,
    paddingVertical: 8,
  },
  sendCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Mute
  muteContainer: {
    alignItems: 'center',
    paddingBottom: 28,
  },
  muteButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  muteHint: {
    marginTop: 10,
    fontSize: 12,
    color: '#4d5b6c',
  },
});
