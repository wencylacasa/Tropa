import { getServices } from '@/core/app/services';
import type { InstallResult } from '@/core/models/download';
import { MODEL_SPECS, whisperModelId, type ModelId, type ModelStatus } from '@/core/models/manager';
import {
  checkPermission,
  requestPermission,
  type PermissionKey,
  type PermissionStatus,
} from '@/core/system/permissions';
import { useSettings } from '@/hooks/use-settings';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ModelView =
  | { phase: 'idle'; status: ModelStatus; error?: string }
  | { phase: 'downloading' | 'verifying'; progress: number };

const PERMISSIONS: { key: PermissionKey; label: string; desc: string; required: boolean }[] = [
  { key: 'microphone', label: 'Microphone', desc: 'Hear the wake word and commands', required: true },
  { key: 'notifications', label: 'Notifications', desc: 'Shows that Tropa is listening', required: false },
  { key: 'contacts', label: 'Contacts', desc: 'Call people by name', required: false },
  { key: 'location', label: 'Location', desc: 'Sent with SOS messages', required: false },
  { key: 'battery', label: 'Battery optimization', desc: 'Keeps listening with the screen off', required: false },
];

const FAILURE_TEXT: Record<Exclude<InstallResult['result'], 'installed' | 'already_installed' | 'not_wifi' | 'cancelled'>, string> = {
  bad_size: 'Download incomplete. Try again.',
  bad_checksum: 'File failed verification. Try again.',
  error: 'Download failed.',
};

const STATUS_TEXT: Record<ModelStatus, string> = {
  installed: 'Installed',
  missing: 'Not downloaded',
  incomplete: 'Incomplete, download again',
  wrong_variant: 'Wrong build found, download the multilingual one',
};

async function checkAllPermissions(): Promise<Partial<Record<PermissionKey, PermissionStatus>>> {
  const entries = await Promise.all(PERMISSIONS.map(async (p) => [p.key, await checkPermission(p.key)] as const));
  return Object.fromEntries(entries);
}

function toMb(bytes: number): number {
  return Math.round(bytes / 1048576);
}

export default function SetupScreen() {
  const router = useRouter();
  const { settings } = useSettings();
  const { models: manager, downloader } = getServices();

  const required: ModelId[] = [whisperModelId(settings.whisperModel)];
  if (settings.llmEnabled) required.push('qwen3-0.6b');

  const [models, setModels] = useState<Partial<Record<ModelId, ModelView>>>({});
  const [perms, setPerms] = useState<Partial<Record<PermissionKey, PermissionStatus>>>({});
  const abortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);

  const viewOf = (id: ModelId): ModelView => models[id] ?? { phase: 'idle', status: manager.status(id) };
  const setView = (id: ModelId, view: ModelView) => setModels((prev) => ({ ...prev, [id]: view }));

  useEffect(() => {
    const refresh = () => checkAllPermissions().then(setPerms);
    refresh();
    // The battery exemption is granted in a system screen; re-check when we come back.
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => {
      sub.remove();
      abortRef.current?.abort();
    };
  }, []);

  const install = async (id: ModelId, allowMobileData = false) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setView(id, { phase: 'downloading', progress: 0 });

    const result = await downloader.install(id, {
      allowMobileData,
      signal: controller.signal,
      onProgress: ({ phase, bytes, totalBytes }) =>
        setView(id, { phase, progress: totalBytes > 0 ? Math.min(100, (bytes / totalBytes) * 100) : 0 }),
    });

    abortRef.current = null;
    setBusy(false);
    const status = manager.status(id);

    switch (result.result) {
      case 'installed':
      case 'already_installed':
      case 'cancelled':
        setView(id, { phase: 'idle', status });
        return;
      case 'not_wifi':
        setView(id, { phase: 'idle', status });
        Alert.alert(
          'Not on Wi-Fi',
          `${MODEL_SPECS[id].label} is ${toMb(MODEL_SPECS[id].sizeBytes)} MB. Download over mobile data?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Use mobile data', onPress: () => install(id, true) },
          ],
        );
        return;
      default:
        setView(id, {
          phase: 'idle',
          status,
          error: result.result === 'error' ? `${FAILURE_TEXT.error} ${result.message}` : FAILURE_TEXT[result.result],
        });
    }
  };

  const ask = async (key: PermissionKey) => {
    const status = await requestPermission(key);
    if (key !== 'battery') setPerms((prev) => ({ ...prev, [key]: status }));
  };

  const askMissing = async () => {
    for (const p of PERMISSIONS) {
      if (perms[p.key] === 'denied' && p.key !== 'battery') await ask(p.key);
    }
  };

  const allModelsReady = required.every((id) => {
    const v = viewOf(id);
    return v.phase === 'idle' && v.status === 'installed';
  });
  const requiredPermsReady = PERMISSIONS.every(
    (p) => !p.required || perms[p.key] === 'granted' || perms[p.key] === 'unavailable',
  );
  const anyMissing = PERMISSIONS.some((p) => p.key !== 'battery' && perms[p.key] === 'denied');
  const canContinue = allModelsReady && requiredPermsReady && !busy;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Setup Tropa</Text>
          <Text style={styles.subtitle}>
            Download the voice models once (Wi-Fi recommended). After that Tropa works fully offline.
          </Text>
        </View>

        {/* Models */}
        <Text style={styles.sectionTitle}>Voice Models</Text>
        {required.map((id) => {
          const spec = MODEL_SPECS[id];
          const view = viewOf(id);
          const isActive = view.phase !== 'idle';
          const installed = view.phase === 'idle' && view.status === 'installed';
          return (
            <View key={id} style={styles.modelCard}>
              <View style={styles.modelHeader}>
                <View style={styles.modelInfo}>
                  <Text style={styles.modelName}>{spec.label}</Text>
                  <Text style={styles.modelSize}>
                    {toMb(spec.sizeBytes)} MB{view.phase === 'idle' && !installed ? ` · ${STATUS_TEXT[view.status]}` : ''}
                  </Text>
                </View>
                {installed ? (
                  <View style={styles.installedBadge}>
                    <Text style={styles.installedText}>✓ Installed</Text>
                  </View>
                ) : isActive ? (
                  <Pressable style={[styles.downloadBtn, styles.downloadBtnDisabled]} onPress={() => abortRef.current?.abort()}>
                    <Text style={styles.downloadBtnText}>Cancel</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.downloadBtn, busy && styles.downloadBtnDisabled]}
                    onPress={() => install(id)}
                    disabled={busy}
                  >
                    <Text style={styles.downloadBtnText}>Download</Text>
                  </Pressable>
                )}
              </View>
              {view.phase === 'idle' && view.error ? <Text style={styles.errorText}>{view.error}</Text> : null}
              {isActive && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${view.progress}%`,
                          backgroundColor: view.phase === 'verifying' ? '#FF9800' : '#208AEF',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {view.phase === 'verifying' ? 'Verifying' : 'Downloading'} {Math.round(view.progress)}%
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Permissions */}
        <Text style={styles.sectionTitle}>Permissions</Text>
        <View style={styles.permCard}>
          {PERMISSIONS.filter((p) => perms[p.key] !== 'unavailable').map((p) => (
            <Pressable
              key={p.key}
              style={styles.permRow}
              onPress={() => perms[p.key] === 'denied' && ask(p.key)}
            >
              <View style={styles.modelInfo}>
                <Text style={styles.permLabel}>
                  {p.label}
                  {p.required ? ' (required)' : ''}
                </Text>
                <Text style={styles.permDesc}>{p.desc}</Text>
              </View>
              {perms[p.key] === 'granted' ? (
                <Text style={styles.permGranted}>✓</Text>
              ) : (
                <View style={styles.permPending}>
                  <Text style={styles.permPendingText}>–</Text>
                </View>
              )}
            </Pressable>
          ))}
          {anyMissing && (
            <Pressable style={styles.grantBtn} onPress={askMissing}>
              <Text style={styles.grantBtnText}>Grant Permissions</Text>
            </Pressable>
          )}
        </View>
        </ScrollView>

        {/* Continue Button */}
        <View style={styles.continueContainer}>
          <Pressable
            style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
            onPress={() => canContinue && router.replace('/')}
            disabled={!canContinue}
          >
            <Text
              style={[
                styles.continueBtnText,
                !canContinue && styles.continueBtnTextDisabled,
              ]}
            >
              Continue
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  safeArea: { flex: 1, paddingHorizontal: 20 },
  scroll: { paddingBottom: 16 },
  modelInfo: { flex: 1, marginRight: 12 },
  errorText: { color: '#ef5350', fontSize: 13, marginTop: 10 },

  header: { paddingTop: 24, paddingBottom: 8 },
  title: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  subtitle: { fontSize: 15, color: '#777', marginTop: 8, lineHeight: 22 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 28,
    marginBottom: 10,
    marginLeft: 4,
  },

  // Model Cards
  modelCard: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1c1c1c',
    marginBottom: 10,
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelName: { color: '#ccc', fontSize: 16, fontWeight: '700' },
  modelSize: { color: '#555', fontSize: 13, marginTop: 2 },
  downloadBtn: {
    backgroundColor: '#208AEF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minHeight: 44,
    justifyContent: 'center',
  },
  downloadBtnDisabled: { backgroundColor: '#0d2f50' },
  downloadBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  installedBadge: {
    backgroundColor: '#0a2a0a',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#4CAF5044',
  },
  installedText: { color: '#4CAF50', fontWeight: '700', fontSize: 13 },

  // Progress
  progressContainer: { marginTop: 12 },
  progressTrack: {
    height: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { color: '#666', fontSize: 12, marginTop: 6, textAlign: 'right' },

  // Permissions
  permCard: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1c1c1c',
  },
  permRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  permLabel: { color: '#ccc', fontSize: 15, fontWeight: '600' },
  permDesc: { color: '#555', fontSize: 12, marginTop: 2 },
  permGranted: { color: '#4CAF50', fontSize: 20, fontWeight: '700' },
  permPending: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permPendingText: { color: '#555', fontSize: 16, fontWeight: '700' },
  grantBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0d2f50',
    borderWidth: 1,
    borderColor: '#208AEF44',
    alignItems: 'center',
  },
  grantBtnText: { color: '#4FC3F7', fontWeight: '700', fontSize: 14 },

  // Continue
  continueContainer: { paddingTop: 8, paddingBottom: 24 },
  continueBtn: {
    backgroundColor: '#208AEF',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    minHeight: 56,
  },
  continueBtnDisabled: { backgroundColor: '#1a1a1a' },
  continueBtnText: { color: '#fff', fontWeight: '800', fontSize: 17, letterSpacing: 0.5 },
  continueBtnTextDisabled: { color: '#444' },
});
