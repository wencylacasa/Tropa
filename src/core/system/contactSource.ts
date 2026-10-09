/**
 * Contact source logic with no native imports: turns raw address-book rows
 * into dialable contacts and caches them. The expo-contacts backend lives in
 * `contacts.ts`; tests use a fake backend.
 *
 * Voice flow rules:
 * - Contacts without a name or a usable number are dropped, so "call X" can
 *   never match someone we cannot dial.
 * - No permission means an empty list (callFlow then says "I can't read your
 *   contacts"). We never prompt mid-ride; the permission is asked in Setup.
 * - An empty/denied result is never cached, so granting later works at once.
 */

import type { ContactSource } from '../pipeline/states';
import type { Contact } from './contactMatch';

export type RawPhone = { label?: string; number?: string };

export type RawContactRow = {
  id: string;
  name: string | null | undefined;
  phones: readonly RawPhone[] | null | undefined;
};

const MIN_DIGITS = 3;
const PREFERRED_LABEL = /mobile|cell/i;

/** Keeps digits and a leading "+"; drops spaces, dashes, brackets. Null if too short to dial. */
export function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < MIN_DIGITS) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/** Prefers a mobile/cell number (riders call phones), else the first usable one. */
export function pickPhone(phones: readonly RawPhone[] | null | undefined): string | null {
  if (!phones) return null;
  const usable = phones
    .map((p) => ({ label: p.label ?? '', number: normalizePhone(p.number) }))
    .filter((p): p is { label: string; number: string } => p.number !== null);
  if (usable.length === 0) return null;
  return (usable.find((p) => PREFERRED_LABEL.test(p.label)) ?? usable[0]).number;
}

export function toDialableContacts(rows: readonly RawContactRow[]): Contact[] {
  const out: Contact[] = [];
  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) continue;
    const phone = pickPhone(row.phones);
    if (!phone) continue;
    out.push({ id: row.id, name, phone });
  }
  return out;
}

export type ContactsBackend = {
  /** True only when the user has granted contacts access. Must not prompt. */
  hasPermission(): Promise<boolean>;
  getRows(): Promise<readonly RawContactRow[]>;
};

export type CachedContactSource = ContactSource & {
  /** Drops the cache (call when the address book changes). */
  invalidate(): void;
};

export type ContactSourceOptions = {
  /** How long a non-empty result is reused. Default 10 minutes. */
  ttlMs?: number;
  now?: () => number;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export function createContactSource(
  backend: ContactsBackend,
  options: ContactSourceOptions = {},
): CachedContactSource {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  let cache: { at: number; contacts: readonly Contact[] } | null = null;
  let inFlight: Promise<readonly Contact[]> | null = null;

  async function load(): Promise<readonly Contact[]> {
    if (!(await backend.hasPermission())) {
      cache = null;
      return [];
    }
    const contacts = toDialableContacts(await backend.getRows());
    cache = contacts.length > 0 ? { at: now(), contacts } : null;
    return contacts;
  }

  return {
    async getContacts() {
      if (cache && now() - cache.at < ttlMs) return cache.contacts;
      // Share one read between overlapping calls (address book reads are slow on old phones).
      inFlight ??= load().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    invalidate() {
      cache = null;
    },
  };
}
