import { useSettings } from '@/hooks/use-settings';
import { useState } from 'react';
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    MAX_EMERGENCY_CONTACTS,
    type Settings,
    type WhisperModel,
} from '../core/settings/settings';

export default function SettingsScreen() {
  const { settings, store } = useSettings();
  const [newWakeWord, setNewWakeWord] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const update = (patch: Partial<Settings>) => {
    store.update(patch);
  };

  const addContact = () => {
    const name = contactName.trim();
    const phone = contactPhone.trim();
    if (!name || !phone) return;
    if (settings.emergencyContacts.length >= MAX_EMERGENCY_CONTACTS) {
      Alert.alert('Limit reached', `You can add up to ${MAX_EMERGENCY_CONTACTS} emergency contacts.`);
      return;
    }
    const before = settings.emergencyContacts.length;
    const next = store.update({ emergencyContacts: [...settings.emergencyContacts, { name, phone }] });
    if (next.emergencyContacts.length === before) {
      Alert.alert('Invalid number', 'Enter a phone number like 0917 123 4567 or +63 917 123 4567.');
      return;
    }
    setContactName('');
    setContactPhone('');
  };

  const addWakeWord = () => {
    const word = newWakeWord.trim().toLowerCase();
    if (!word) return;
    if (settings.wakeWords.some((w) => w.word === word)) {
      Alert.alert('Duplicate', `"${word}" is already in the list.`);
      return;
    }
    update({ wakeWords: [...settings.wakeWords, { word, variants: [] }] });
    setNewWakeWord('');
  };

  const removeWakeWord = (word: string) => {
    if (settings.wakeWords.length <= 1) {
      Alert.alert('Cannot remove', 'You need at least one wake word.');
      return;
    }
    update({ wakeWords: settings.wakeWords.filter((w) => w.word !== word) });
  };

  const removeContact = (idx: number) => {
    update({
      emergencyContacts: settings.emergencyContacts.filter((_, i) => i !== idx),
    });
  };

  const resetDefaults = () => {
    Alert.alert('Reset Settings', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => store.reset() },
    ]);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Wake Words */}
          <Text style={styles.sectionTitle}>Wake Words</Text>
          <View style={styles.card}>
            <View style={styles.chipContainer}>
              {settings.wakeWords.map((w) => (
                <View key={w.word} style={styles.chip}>
                  <Text style={styles.chipText}>{w.word}</Text>
                  <Pressable
                    onPress={() => removeWakeWord(w.word)}
                    hitSlop={8}
                    style={styles.chipRemove}
                  >
                    <Text style={styles.chipRemoveText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                placeholder="Add wake word..."
                placeholderTextColor="#555"
                value={newWakeWord}
                onChangeText={setNewWakeWord}
                onSubmitEditing={addWakeWord}
                returnKeyType="done"
                autoCapitalize="none"
              />
              <Pressable style={styles.addBtn} onPress={addWakeWord}>
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            </View>
          </View>

          {/* Model Settings */}
          <Text style={styles.sectionTitle}>Model Settings</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Whisper Model</Text>
            <View style={styles.toggleRow}>
              {(['tiny', 'base'] as WhisperModel[]).map((m) => (
                <Pressable
                  key={m}
                  style={[
                    styles.toggleBtn,
                    settings.whisperModel === m && styles.toggleBtnActive,
                  ]}
                  onPress={() => update({ whisperModel: m })}
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      settings.whisperModel === m && styles.toggleBtnTextActive,
                    ]}
                  >
                    {m === 'tiny' ? 'Tiny (fast)' : 'Base (accurate)'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.label}>LLM Enabled</Text>
                <Text style={styles.hint}>Use Qwen for complex commands</Text>
              </View>
              <Switch
                value={settings.llmEnabled}
                onValueChange={(v) => update({ llmEnabled: v })}
                trackColor={{ false: '#333', true: '#208AEF55' }}
                thumbColor={settings.llmEnabled ? '#208AEF' : '#666'}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.label}>Keep Model Loaded</Text>
                <Text style={styles.hint}>Faster but uses more RAM</Text>
              </View>
              <Switch
                value={settings.keepModelLoaded}
                onValueChange={(v) => update({ keepModelLoaded: v })}
                trackColor={{ false: '#333', true: '#208AEF55' }}
                thumbColor={settings.keepModelLoaded ? '#208AEF' : '#666'}
              />
            </View>
          </View>

          {/* Emergency Contacts */}
          <Text style={styles.sectionTitle}>Emergency Contacts</Text>
          <View style={styles.card}>
            {settings.emergencyContacts.length === 0 ? (
              <Text style={styles.emptyText}>No emergency contacts added.</Text>
            ) : (
              settings.emergencyContacts.map((c, i) => (
                <View key={i} style={styles.contactRow}>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{c.name}</Text>
                    <Text style={styles.contactPhone}>{c.phone}</Text>
                  </View>
                  <Pressable onPress={() => removeContact(i)} hitSlop={8}>
                    <Text style={styles.removeText}>✕</Text>
                  </Pressable>
                </View>
              ))
            )}
            <TextInput
              style={[styles.input, styles.contactInput]}
              placeholder="Name"
              placeholderTextColor="#555"
              value={contactName}
              onChangeText={setContactName}
              maxLength={50}
            />
            <TextInput
              style={[styles.input, styles.contactInput]}
              placeholder="Phone number"
              placeholderTextColor="#555"
              value={contactPhone}
              onChangeText={setContactPhone}
              onSubmitEditing={addContact}
              keyboardType="phone-pad"
              maxLength={20}
            />
            <Pressable style={styles.addContactBtn} onPress={addContact}>
              <Text style={styles.addContactBtnText}>+ Add Contact</Text>
            </Pressable>
          </View>

          {/* Debug & Logs */}
          <Text style={styles.sectionTitle}>Debug & Logs</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.label}>Debug Mode</Text>
                <Text style={styles.hint}>Show timing and RAM info</Text>
              </View>
              <Switch
                value={settings.debug}
                onValueChange={(v) => update({ debug: v })}
                trackColor={{ false: '#333', true: '#208AEF55' }}
                thumbColor={settings.debug ? '#208AEF' : '#666'}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.label}>Trigger Logging</Text>
                <Text style={styles.hint}>Save JSONL log of every trigger</Text>
              </View>
              <Switch
                value={settings.logging}
                onValueChange={(v) => update({ logging: v })}
                trackColor={{ false: '#333', true: '#208AEF55' }}
                thumbColor={settings.logging ? '#208AEF' : '#666'}
              />
            </View>
          </View>

          {/* About */}
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <View style={styles.aboutRow}>
              <Text style={styles.label}>Version</Text>
              <Text style={styles.aboutValue}>1.0.0</Text>
            </View>
            <Pressable style={styles.resetBtn} onPress={resetDefaults}>
              <Text style={styles.resetBtnText}>Reset to Defaults</Text>
            </Pressable>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  safeArea: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 8 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 4,
  },

  card: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1c1c1c',
  },

  // Wake Words
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2a3a',
    borderRadius: 20,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: '#208AEF33',
  },
  chipText: { color: '#4FC3F7', fontSize: 14, fontWeight: '600' },
  chipRemove: { marginLeft: 8, padding: 4 },
  chipRemoveText: { color: '#666', fontSize: 12 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#222',
  },
  addBtn: {
    backgroundColor: '#208AEF',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Toggles
  label: { color: '#ccc', fontSize: 15, fontWeight: '600' },
  hint: { color: '#555', fontSize: 12, marginTop: 2 },
  toggleRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#0d2f50',
    borderColor: '#208AEF',
  },
  toggleBtnText: { color: '#666', fontWeight: '600', fontSize: 14 },
  toggleBtnTextActive: { color: '#4FC3F7' },

  // Switch rows
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 56,
  },
  switchInfo: { flex: 1, marginRight: 12 },

  // Emergency Contacts
  emptyText: { color: '#555', fontSize: 14, paddingVertical: 8 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  contactInfo: { flex: 1 },
  contactName: { color: '#ccc', fontSize: 15, fontWeight: '600' },
  contactPhone: { color: '#666', fontSize: 13, marginTop: 2 },
  removeText: { color: '#666', fontSize: 16, padding: 8 },
  contactInput: { flex: 0, marginTop: 10 },
  addContactBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#208AEF44',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addContactBtnText: { color: '#208AEF', fontWeight: '600', fontSize: 14 },

  // About
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  aboutValue: { color: '#666', fontSize: 15 },
  resetBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1a0a0a',
    borderWidth: 1,
    borderColor: '#d32f2f44',
    alignItems: 'center',
  },
  resetBtnText: { color: '#ef5350', fontWeight: '700', fontSize: 14 },

  bottomSpacer: { height: 40 },
});
