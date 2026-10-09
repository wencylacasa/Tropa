/**
 * Streaming SHA-256 in plain TypeScript, so a 400 MB model can be verified
 * chunk by chunk without loading it into RAM (expo-crypto's digest() takes the
 * whole buffer). Pure JS, so it is slow-ish on old phones: it runs once per
 * download, and Setup can skip it (the exact byte size is still checked).
 *
 * The constants are derived, not typed in: H0 is the fractional part of the
 * square roots of the first 8 primes and K is the fractional part of the cube
 * roots of the first 64 primes (FIPS 180-4), taken to 32 bits. The unit tests
 * check the result against published test vectors.
 */

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function firstPrimes(count: number): number[] {
  const out: number[] = [];
  for (let n = 2; out.length < count; n++) {
    if (out.every((p) => n % p !== 0)) out.push(n);
  }
  return out;
}

function fractionBits(x: number): number {
  return Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
}

const PRIMES = firstPrimes(64);
const K = Uint32Array.from(PRIMES, (p) => fractionBits(Math.cbrt(p)));
const H0 = Uint32Array.from(PRIMES.slice(0, 8), (p) => fractionBits(Math.sqrt(p)));

export class Sha256 {
  private readonly state = Uint32Array.from(H0);
  private readonly block = new Uint8Array(64);
  private readonly w = new Uint32Array(64);
  private blockLen = 0;
  private totalBytes = 0;
  private finished = false;

  update(data: Uint8Array): this {
    if (this.finished) throw new Error('Sha256: update() after digestHex()');
    this.totalBytes += data.length;
    this.feed(data);
    return this;
  }

  /** Finishes the hash. The instance cannot be used afterwards. */
  digestHex(): string {
    if (this.finished) throw new Error('Sha256: digestHex() called twice');

    const bitsHigh = Math.floor(this.totalBytes / 0x20000000); // (bytes * 8) / 2^32
    const bitsLow = (this.totalBytes * 8) % 4294967296;

    const padLength = (this.blockLen < 56 ? 56 : 120) - this.blockLen;
    const tail = new Uint8Array(padLength + 8);
    tail[0] = 0x80;
    for (let i = 0; i < 4; i++) {
      tail[padLength + i] = (bitsHigh >>> (24 - 8 * i)) & 0xff;
      tail[padLength + 4 + i] = (bitsLow >>> (24 - 8 * i)) & 0xff;
    }
    this.feed(tail);
    this.finished = true;

    let hex = '';
    for (const word of this.state) hex += word.toString(16).padStart(8, '0');
    return hex;
  }

  /** Runs whole 64-byte blocks, buffering any remainder. Does not count length. */
  private feed(data: Uint8Array): void {
    let i = 0;

    if (this.blockLen > 0) {
      const take = Math.min(64 - this.blockLen, data.length);
      this.block.set(data.subarray(0, take), this.blockLen);
      this.blockLen += take;
      i = take;
      if (this.blockLen === 64) {
        this.compress(this.block, 0);
        this.blockLen = 0;
      }
    }

    for (; i + 64 <= data.length; i += 64) this.compress(data, i);

    if (i < data.length) {
      this.block.set(data.subarray(i), 0);
      this.blockLen = data.length - i;
    }
  }

  private compress(bytes: Uint8Array, offset: number): void {
    const w = this.w;
    for (let t = 0; t < 16; t++) {
      const o = offset + 4 * t;
      w[t] = (bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3];
    }
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15];
      const y = w[t - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[t] = w[t - 16] + s0 + w[t - 7] + s1; // Uint32Array wraps modulo 2^32
    }

    const s = this.state;
    let a = s[0];
    let b = s[1];
    let c = s[2];
    let d = s[3];
    let e = s[4];
    let f = s[5];
    let g = s[6];
    let h = s[7];

    for (let t = 0; t < 64; t++) {
      const bigS1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + bigS1 + ch + K[t] + w[t]) | 0;
      const bigS0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (bigS0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    s[0] += a;
    s[1] += b;
    s[2] += c;
    s[3] += d;
    s[4] += e;
    s[5] += f;
    s[6] += g;
    s[7] += h;
  }
}

export function sha256Hex(data: Uint8Array): string {
  return new Sha256().update(data).digestHex();
}
