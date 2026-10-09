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
import { useOrchestrator } from '../core/pipeline/Provider';
import type { PipelineState } from '../core/pipeline/states';

const STATE_CONFIG: Record<PipelineState, { color: string; label: string }> = {
  idle: { color: '#208AEF', label: "Listening for 'Yah'" },
  triggered: { color: '#fff', label: 'Triggered' },
  recording: { color: '#4CAF50', label: 'Listening...' },
  stt: { color: '#FF9800', label: 'Thinking...' },
  verify: { color: '#FF9800', label: 'Processing...' },
  intent: { color: '#FF9800', label: 'Understanding...' },
  act: { color: '#208AEF', label: 'Acting...' },
  speak: { color: '#4FC3F7', label: 'Speaking' },
};

export default function HomeScreen() {
  const router = useRouter();
  const { status, toggleMute } = useOrchestrator();
  const { settings } = useSettings();

  const pulse = useSharedValue(1);
  const muteScale = useSharedValue(1);

  const cfg = STATE_CONFIG[status.state] ?? STATE_CONFIG.idle;

  useEffect(() => {
    if (status.isMuted) {
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
  }, [status.isMuted, status.state, pulse]);

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
    toggleMute();
  };

  // First-launch gate: stay in Setup until the models this configuration needs are on disk.
  if (!getServices().models.readiness(settings).ready) return <Redirect href="/setup" />;

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
                backgroundColor: status.isMuted ? '#333' : cfg.color + '18',
                borderColor: status.isMuted ? '#555' : cfg.color + '40',
              },
            ]}
          />
          <Animated.View
            style={[
              styles.orb,
              orbStyle,
              {
                backgroundColor: status.isMuted ? '#222' : cfg.color + '30',
                borderColor: status.isMuted ? '#444' : cfg.color,
                shadowColor: status.isMuted ? '#333' : cfg.color,
              },
            ]}
          >
            {status.isMuted ? (
              <Text style={styles.orbMuteIcon}>✕</Text>
            ) : (
              <Text style={[styles.orbDot, { backgroundColor: cfg.color }]} />
            )}
          </Animated.View>
          <Text style={[styles.stateLabel, { color: status.isMuted ? '#666' : cfg.color }]}>
            {status.isMuted ? 'Muted' : cfg.label}
          </Text>
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
                  backgroundColor: status.isMuted ? '#3a1111' : '#0d2f50',
                  borderColor: status.isMuted ? '#d32f2f' : '#208AEF',
                },
              ]}
            >
              <Text style={styles.muteIcon}>
                {status.isMuted ? '🔇' : '🎤'}
              </Text>
              <Text
                style={[
                  styles.muteLabel,
                  { color: status.isMuted ? '#ef5350' : '#4FC3F7' },
                ]}
              >
                {status.isMuted ? 'Unmute' : 'Mute'}
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
