import { Sha256, sha256Hex } from '@/core/models/sha256';

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

function hashInChunks(data: Uint8Array, sizes: number[]): string {
  const hash = new Sha256();
  let offset = 0;
  for (let i = 0; offset < data.length; i++) {
    const size = sizes[i % sizes.length];
    hash.update(data.subarray(offset, offset + size));
    offset += size;
  }
  return hash.digestHex();
}

describe('Sha256', () => {
  it('matches the published test vectors', () => {
    expect(sha256Hex(ascii(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(ascii('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('handles the 56-byte message that needs a second padding block', () => {
    const message = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
    expect(message).toHaveLength(56);
    expect(sha256Hex(ascii(message))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('hashes a million "a" characters fed in odd-sized chunks', () => {
    const data = new Uint8Array(1_000_000).fill(97);
    expect(hashInChunks(data, [7777])).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('gives the same result however the input is split', () => {
    const data = Uint8Array.from({ length: 10_000 }, (_, i) => (i * 31 + 7) % 256);
    const whole = sha256Hex(data);
    expect(hashInChunks(data, [1])).toBe(whole);
    expect(hashInChunks(data, [63, 64, 65])).toBe(whole);
    expect(hashInChunks(data, [1000, 1, 4096])).toBe(whole);
  });

  it('is consistent around the block and padding boundaries', () => {
    for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129]) {
      const data = Uint8Array.from({ length }, (_, i) => (i * 13 + 5) % 256);
      expect(hashInChunks(data.length ? data : new Uint8Array(0), [1])).toBe(sha256Hex(data));
    }
  });

  it('refuses to be used after finishing', () => {
    const hash = new Sha256().update(ascii('abc'));
    hash.digestHex();
    expect(() => hash.update(ascii('x'))).toThrow();
    expect(() => hash.digestHex()).toThrow();
  });
});
