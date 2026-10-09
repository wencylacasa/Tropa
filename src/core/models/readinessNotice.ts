import { MODEL_SPECS, type ModelStatus, type Readiness } from './manager';

const STATUS_TEXT: Record<Exclude<ModelStatus, 'installed'>, string> = {
  missing: 'not downloaded',
  incomplete: 'incomplete, needs a new download',
  wrong_variant: 'wrong build (English-only), needs the multilingual one',
};

/** One short paragraph for the Home screen, or null when everything is ready. */
export function readinessNotice(readiness: Readiness): string | null {
  if (readiness.ready) return null;

  const lines = readiness.blocking.map((entry) => {
    const status = entry.status === 'installed' ? 'ready' : STATUS_TEXT[entry.status];
    return `${MODEL_SPECS[entry.id].label}: ${status}`;
  });
  return `Tropa needs its voice models before it can listen.\n${lines.join('\n')}`;
}
