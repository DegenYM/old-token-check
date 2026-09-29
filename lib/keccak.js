// Minimal Keccak-256 (the pre-NIST padding variant used by Ethereum).
// 64-bit lanes are held as (lo, hi) pairs of 32-bit integers in a Uint32Array.
// No dependencies; works in browsers and Node.

const RC = [
  0x00000001, 0x00000000, 0x00008082, 0x00000000, 0x0000808a, 0x80000000, 0x80008000, 0x80000000,
  0x0000808b, 0x00000000, 0x80000001, 0x00000000, 0x80008081, 0x80000000, 0x00008009, 0x80000000,
  0x0000008a, 0x00000000, 0x00000088, 0x00000000, 0x80008009, 0x00000000, 0x8000000a, 0x00000000,
  0x8000808b, 0x00000000, 0x0000008b, 0x80000000, 0x00008089, 0x80000000, 0x00008003, 0x80000000,
  0x00008002, 0x80000000, 0x00000080, 0x80000000, 0x0000800a, 0x00000000, 0x8000000a, 0x80000000,
  0x80008081, 0x80000000, 0x00008080, 0x80000000, 0x80000001, 0x00000000, 0x80008008, 0x80000000,
]; // [lo, hi] pairs for the 24 round constants

// Rotation offsets indexed by x + 5y
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
// Pi destination index for source lane x + 5y  ->  y + 5 * ((2x + 3y) % 5)
const PI = new Array(25);
for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) PI[x + 5 * y] = y + 5 * ((2 * x + 3 * y) % 5);

function keccakF(s) {
  const C = new Uint32Array(10);
  const B = new Uint32Array(50);
  for (let round = 0; round < 24; round++) {
    // Theta
    for (let x = 0; x < 5; x++) {
      C[2 * x] = s[2 * x] ^ s[2 * x + 10] ^ s[2 * x + 20] ^ s[2 * x + 30] ^ s[2 * x + 40];
      C[2 * x + 1] = s[2 * x + 1] ^ s[2 * x + 11] ^ s[2 * x + 21] ^ s[2 * x + 31] ^ s[2 * x + 41];
    }
    for (let x = 0; x < 5; x++) {
      const x1 = (x + 1) % 5, x4 = (x + 4) % 5;
      const lo1 = C[2 * x1], hi1 = C[2 * x1 + 1];
      const dLo = C[2 * x4] ^ ((lo1 << 1) | (hi1 >>> 31));
      const dHi = C[2 * x4 + 1] ^ ((hi1 << 1) | (lo1 >>> 31));
      for (let y = 0; y < 25; y += 5) {
        s[2 * (x + y)] ^= dLo;
        s[2 * (x + y) + 1] ^= dHi;
      }
    }
    // Rho + Pi
    for (let i = 0; i < 25; i++) {
      const lo = s[2 * i], hi = s[2 * i + 1];
      const n = ROT[i];
      let rLo, rHi;
      if (n === 0) { rLo = lo; rHi = hi; }
      else if (n < 32) { rLo = (lo << n) | (hi >>> (32 - n)); rHi = (hi << n) | (lo >>> (32 - n)); }
      else if (n === 32) { rLo = hi; rHi = lo; }
      else { const m = n - 32; rLo = (hi << m) | (lo >>> (32 - m)); rHi = (lo << m) | (hi >>> (32 - m)); }
      const d = PI[i];
      B[2 * d] = rLo;
      B[2 * d + 1] = rHi;
    }
    // Chi
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) {
        const a = 2 * (x + y), b = 2 * (((x + 1) % 5) + y), c = 2 * (((x + 2) % 5) + y);
        s[a] = B[a] ^ (~B[b] & B[c]);
        s[a + 1] = B[a + 1] ^ (~B[b + 1] & B[c + 1]);
      }
    }
    // Iota
    s[0] ^= RC[2 * round];
    s[1] ^= RC[2 * round + 1];
  }
}

/** keccak256(bytes: Uint8Array) -> Uint8Array(32) */
export function keccak256Bytes(input) {
  const rate = 136;
  const s = new Uint32Array(50);
  const padded = new Uint8Array(Math.floor(input.length / rate + 1) * rate);
  padded.set(input);
  padded[input.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 4; i++) {
      const j = off + 4 * i;
      s[i] ^= padded[j] | (padded[j + 1] << 8) | (padded[j + 2] << 16) | (padded[j + 3] << 24);
    }
    keccakF(s);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const w = s[i];
    out[4 * i] = w & 0xff;
    out[4 * i + 1] = (w >>> 8) & 0xff;
    out[4 * i + 2] = (w >>> 16) & 0xff;
    out[4 * i + 3] = (w >>> 24) & 0xff;
  }
  return out;
}

const enc = new TextEncoder();

/** keccak256 of a UTF-8 string or Uint8Array, returned as 0x-prefixed hex */
export function keccak256(data) {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  const out = keccak256Bytes(bytes);
  let hex = '0x';
  for (const b of out) hex += b.toString(16).padStart(2, '0');
  return hex;
}
