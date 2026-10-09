import { getServices } from '@/core/app/services';
import { useSettings } from '@/hooks/use-settings';
import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { statusLabel } from '../core/app/status';
import { useOrchestrator } from '../core/pipeline/Provider';
import type { PipelineState } from '../core/pipeline/states';

const STATE_COLOR: Record<PipelineState, string> = {
  idle: '#208AEF',
  triggered: '#fff',
  recording: '#4CAF50',
  stt: '#FF9800',
  verify: '#FF9800',
  intent: '#FF9800',
  act: '#208AEF',
  speak: '#4FC3F7',
};

export default function HomeScreen() {
  const router = useRouter();
  const { status, start, toggleMute } = useOrchestrator();
  const { settings } = useSettings();
  const ready = getServices().models.readiness(settings).ready;

  const pulse = useSharedValue(1);
  const muteScale = useSharedValue(1);

  // "Off" covers both muted and a mic that failed to start.
  const off = status.muted || !status.listening;
  const color = STATE_COLOR[status.pipeline];

  // Start listening as soon as Setup is done. Starting here (app visible) also
  // satisfies Android 14's rule for microphone foreground services.
  useEffect(() => {
    if (ready) void start();
  }, [ready, start]);

  useEffect(() => {
    if (off) {
      pulse.set(1);
      return;
    }
    pulse.set(withRepeat(
      withSequence(
        withTiming(1.15, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    ));
  }, [off, status.pipeline, pulse]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
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
          <Text style={styles.appName}>Tropa</Text>
          <Pressable
            onPress={() => router.push('/settings')}
            style={styles.settingsBtn}
            hitSlop={16}
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
          </Pressable>
        </View>

        {/* Status Orb */}
        <View style={styles.orbContainer}>
          <Animated.View
            style={[
              styles.orbGlow,
              orbStyle,
              {
                backgroundColor: off ? '#333' : color + '18',
                borderColor: off ? '#555' : color + '40',
              },
            ]}
          />
          <Animated.View
            style={[
              styles.orb,
              orbStyle,
              {
                backgroundColor: off ? '#222' : color + '30',
                borderColor: off ? '#444' : color,
                shadowColor: off ? '#333' : color,
              },
            ]}
          >
            {off ? (
              <Text style={styles.orbMuteIcon}>✕</Text>
            ) : (
              <Text style={[styles.orbDot, { backgroundColor: color }]} />
            )}
          </Animated.View>
          <Text style={[styles.stateLabel, { color: off ? '#666' : color }]}>
            {statusLabel(status, settings.wakeWords[0]?.word)}
          </Text>
          {status.error ? (
            <Text style={styles.errorText} numberOfLines={3}>
              {status.error}
            </Text>
          ) : null}
        </View>

        {/* Activity Log */}
        <View style={styles.logContainer}>
          <View style={styles.logRow}>
            <Text style={styles.logLabel}>Last heard</Text>
            <Text style={styles.logValue} numberOfLines={2}>
              {status.lastHeard ?? '—'}
            </Text>
          </View>
          <View style={styles.logDivider} />
          <View style={styles.logRow}>
            <Text style={styles.logLabel}>Last action</Text>
            <Text style={styles.logValue} numberOfLines={1}>
              {status.lastAction ?? '—'}
              {status.lastTimingMs !== null ? `  (${(status.lastTimingMs / 1000).toFixed(1)} s)` : ''}
            </Text>
          </View>
          <View style={styles.logDivider} />
          <View style={styles.logRow}>
            <Text style={styles.logLabel}>Last reply</Text>
            <Text style={styles.logValue} numberOfLines={2}>
              {status.lastReply ?? '—'}
            </Text>
          </View>
        </View>

        {/* Mute Button */}
        <View style={styles.muteContainer}>
          <Pressable onPress={handleMutePress}>
            <Animated.View
              style={[
                styles.muteButton,
                muteStyle,
                {
                  backgroundColor: status.muted ? '#3a1111' : '#0d2f50',
                  borderColor: status.muted ? '#d32f2f' : '#208AEF',
                },
              ]}
            >
              <Text style={styles.muteIcon}>
                {status.muted ? '🔇' : '🎤'}
              </Text>
              <Text
                style={[
                  styles.muteLabel,
                  { color: status.muted ? '#ef5350' : '#4FC3F7' },
                ]}
              >
                {status.muted ? 'Unmute' : 'Mute'}
              </Text>
            </Animated.View>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  settingsBtn: {
    padding: 8,
  },
  settingsIcon: {
    fontSize: 24,
  },
  // Orb
  orbContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
  },
  orb: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 12,
  },
  orbDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  orbMuteIcon: {
    fontSize: 40,
    color: '#d32f2f',
    fontWeight: '300',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#ef5350',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  stateLabel: {
    marginTop: 24,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  // Log
  logContainer: {
    backgroundColor: '#0a0a0a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  logRow: {
    paddingVertical: 8,
  },
  logLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  logValue: {
    fontSize: 15,
    color: '#999',
    fontFamily: 'monospace',
  },
  logDivider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginVertical: 4,
  },
  // Mute
  muteContainer: {
    alignItems: 'center',
    paddingBottom: 32,
  },
  muteButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  muteIcon: {
    fontSize: 32,
  },
  muteLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
