import { AudioHub } from '../audio/hub';
import { PreRollBuffer } from '../audio/preRollBuffer';
import { VadClipRecorder } from '../audio/recorder';
import { EnergyVad } from '../audio/vad';
import { EnergyFallbackDetector } from '../detector/energyFallback';
import { parseCommand } from '../intents/dispatcher';
import { LlmParser } from '../intents/llmParser';
import type { Settings } from '../settings/settings';
import { WhisperService } from '../stt/whisperService';
import { audioFocus } from '../system/audioFocus';
import { getBatteryLevel } from '../system/battery';
import { createExpoContactSource } from '../system/contacts';
import { NativeDialer } from '../system/dialer';
import { ExpoLocationCache } from '../system/location';
import { createNativeMicSource, foregroundService, nativeBeep, onNotificationStop } from '../system/nativeAudio';
import { nativeSmsSender } from '../system/sms';
import { triggerLogger } from '../system/triggerLogger';
import { ExpoSpeaker } from '../tts/speak';
import { AssistantRuntime, type BuiltPorts } from './runtime';
import { getServices } from './services';
import { StatusStore } from './status';

type Assistant = {
  runtime: AssistantRuntime;
  status: StatusStore;
};

let assistant: Assistant | null = null;

/** Spelling hint for Whisper so wake words come out the way verify() expects. */
function whisperPrompt(settings: Settings): string {
  return settings.wakeWords.map((w) => w.word).join(', ');
}

/**
 * The real assistant, wired to the device adapters. Created on first use.
 * Detector: only the VAD-only fallback exists so far, so it is used for every
 * detector setting until Vosk / sherpa-onnx are added (Whisper + verify still
 * gate every trigger, it just runs Whisper more often).
 */
export function getAssistant(): Assistant {
  if (assistant) return assistant;

  const { settings, models } = getServices();
  const status = new StatusStore();
  const contacts = createExpoContactSource();
  const dialer = new NativeDialer();
  const location = new ExpoLocationCache();
  const tts = new ExpoSpeaker({ language: 'en-US' });

  const runtime = new AssistantRuntime(settings, status, {
    createHub: () =>
      new AudioHub(
        createNativeMicSource(undefined, (message) => status.setError(message)),
        new EnergyVad(),
        new PreRollBuffer(4000),
      ),
    createPorts: (hub, current): BuiltPorts => {
      const llmParser =
        current.llmEnabled && models.getLlmPath()
          ? new LlmParser({ getModelPath: () => models.getLlmPath(), keepLoaded: current.keepModelLoaded })
          : null;
      const stt = new WhisperService({
        getModelPath: () => models.getWhisperPath(current.whisperModel),
        keepLoaded: current.keepModelLoaded,
        prompt: whisperPrompt(current),
      });

      return {
        release: async () => {
          await Promise.allSettled([stt.release(), llmParser?.release()]);
        },
        detector: new EnergyFallbackDetector(hub),
        recorder: new VadClipRecorder(hub),
        stt,
        tts,
        feedback: nativeBeep,
        llm: llmParser
          ? { parse: async (command) => (await parseCommand(command, llmParser.port())).command }
          : undefined,
        contacts,
        dialer,
        now: () => new Date(),
        getBatteryLevel,
        getEmergencyContacts: () => settings.get().emergencyContacts,
        getLocation: () => location.getLastKnownLocation(),
        sendSms: (phone, message) => nativeSmsSender.sendSilentSms(phone, message),
        audioFocus,
      };
    },
    foreground: foregroundService,
    location,
    log: (outcome, ms) => void triggerLogger.log(outcome, ms),
  });

  onNotificationStop(() => void runtime.handleExternalStop());

  assistant = { runtime, status };
  return assistant;
}
