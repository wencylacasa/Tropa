import { DEFAULT_WAKE_WORDS, type WakeWord } from '../wake/wakeWords';

export const DETECTOR_TYPES = ['vosk', 'sherpa', 'energy'] as const;
export type DetectorType = (typeof DETECTOR_TYPES)[number];

export const SENSITIVITIES = ['low', 'medium', 'high'] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export const WHISPER_MODELS = ['tiny', 'base'] as const;
export type WhisperModel = (typeof WHISPER_MODELS)[number];

export const REPLY_LANGUAGES = ['en', 'tl'] as const;
export type ReplyLanguage = (typeof REPLY_LANGUAGES)[number];

export type EmergencyContact = { name: string; phone: string };

export type Settings = {
  wakeWords: WakeWord[];
  detector: DetectorType;
  /** Plan: HIGH by default, over-triggering is allowed (verify is the gate). */
  detectorSensitivity: Sensitivity;
  whisperModel: WhisperModel;
  /** Keep Whisper/Qwen resident instead of load > use > release. */
  keepModelLoaded: boolean;
  /** false = "fast mode": keyword rules only, no Qwen. */
  llmEnabled: boolean;
  /** English is the default; Tagalog replies are an optional extra. */
  replyLanguage: ReplyLanguage;
  emergencyContacts: EmergencyContact[];
  /** Installed TTS voice id, or null for the engine default. */
  ttsVoice: string | null;
  debug: boolean;
  logging: boolean;
};

export const MAX_WAKE_WORDS = 20;
export const MAX_WAKE_WORD_LENGTH = 30;
export const MAX_EMERGENCY_CONTACTS = 5;

function cloneWakeWords(words: WakeWord[]): WakeWord[] {
  return words.map((w) => ({ word: w.word, variants: [...w.variants] }));
}

export function defaultSettings(): Settings {
  return {
    wakeWords: cloneWakeWords(DEFAULT_WAKE_WORDS),
    detector: 'vosk',
    detectorSensitivity: 'high',
    whisperModel: 'tiny',
    keepModelLoaded: true,
    llmEnabled: true,
    replyLanguage: 'en',
    emergencyContacts: [],
    ttsVoice: null,
    debug: false,
    logging: false,
  };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeWord(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

function sanitizeWakeWords(value: unknown, fallback: WakeWord[]): WakeWord[] {
  if (!Array.isArray(value)) return cloneWakeWords(fallback);

  const seen = new Set<string>();
  const out: WakeWord[] = [];
  for (const item of value) {
    if (out.length >= MAX_WAKE_WORDS) break;
    if (typeof item !== 'object' || item === null) continue;

    const entry = item as { word?: unknown; variants?: unknown };
    const word = normalizeWord(entry.word);
    if (!word || word.length > MAX_WAKE_WORD_LENGTH || seen.has(word)) continue;
    seen.add(word);

    const variants = new Set<string>();
    if (Array.isArray(entry.variants)) {
      for (const v of entry.variants) {
        const variant = normalizeWord(v);
        if (variant && variant.length <= MAX_WAKE_WORD_LENGTH) variants.add(variant);
      }
    }
    out.push({ word, variants: Array.from(variants) });
  }

  // An empty list would make the assistant deaf; keep the previous/default list instead.
  return out.length > 0 ? out : cloneWakeWords(fallback);
}

const PHONE_CHARS = /^\+?[0-9 ()-]{3,20}$/;

/** Digits plus the usual separators: "0917 123 4567", "+63 917 123 4567", "(02) 8123-4567". */
function isPlausiblePhone(phone: string): boolean {
  return PHONE_CHARS.test(phone) && (phone.match(/[0-9]/g) ?? []).length >= 3;
}

function sanitizeContacts(value: unknown): EmergencyContact[] {
  if (!Array.isArray(value)) return [];

  const out: EmergencyContact[] = [];
  for (const item of value) {
    if (out.length >= MAX_EMERGENCY_CONTACTS) break;
    if (typeof item !== 'object' || item === null) continue;

    const entry = item as { name?: unknown; phone?: unknown };
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 50) : '';
    const phone = typeof entry.phone === 'string' ? entry.phone.trim() : '';
    if (!name || !isPlausiblePhone(phone)) continue;
    out.push({ name, phone });
  }
  return out;
}

/**
 * Turns anything (a corrupt file, a hand-edited file, a partial patch) into a
 * valid Settings object. Invalid fields fall back to `base`, never throw.
 */
export function sanitizeSettings(raw: unknown, base: Settings = defaultSettings()): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const voice = typeof r.ttsVoice === 'string' && r.ttsVoice.trim() ? r.ttsVoice.trim() : null;

  return {
    wakeWords: sanitizeWakeWords(r.wakeWords, base.wakeWords),
    detector: oneOf(r.detector, DETECTOR_TYPES, base.detector),
    detectorSensitivity: oneOf(r.detectorSensitivity, SENSITIVITIES, base.detectorSensitivity),
    whisperModel: oneOf(r.whisperModel, WHISPER_MODELS, base.whisperModel),
    keepModelLoaded: bool(r.keepModelLoaded, base.keepModelLoaded),
    llmEnabled: bool(r.llmEnabled, base.llmEnabled),
    replyLanguage: oneOf(r.replyLanguage, REPLY_LANGUAGES, base.replyLanguage),
    emergencyContacts: 'emergencyContacts' in r ? sanitizeContacts(r.emergencyContacts) : base.emergencyContacts,
    ttsVoice: 'ttsVoice' in r ? voice : base.ttsVoice,
    debug: bool(r.debug, base.debug),
    logging: bool(r.logging, base.logging),
  };
}
