import { gcm } from '@noble/ciphers/aes.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

/**
 * Encrypted backups (M5): the backup JSON sealed with AES-256-GCM under a key
 * scrypt derives from your password. Pure — the caller supplies random bytes
 * (the phone's secure random). Wrong password or a changed file fails the
 * GCM check; nothing is half-decrypted.
 */

export interface EncryptedBackup {
  app: 'lifeos';
  kind: 'encrypted-backup';
  v: 1;
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  nonce: string;
  data: string;
}

const KDF = { N: 2 ** 15, r: 8, p: 1 };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < bytes.length ? B64[n & 63]! : '=');
  }
  return out;
}
export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]!) << 18) | (B64.indexOf(clean[i + 1]!) << 12) | ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) | (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** UTF-8 by hand: not every phone JS engine has TextDecoder. */
export function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}
export function fromUtf8(b: Uint8Array): string {
  let s = '';
  const parts: string[] = [];
  for (let i = 0; i < b.length; ) {
    const x = b[i]!;
    let c: number;
    if (x < 0x80) (c = x), (i += 1);
    else if (x < 0xe0) (c = ((x & 31) << 6) | (b[i + 1]! & 63)), (i += 2);
    else if (x < 0xf0) (c = ((x & 15) << 12) | ((b[i + 1]! & 63) << 6) | (b[i + 2]! & 63)), (i += 3);
    else (c = ((x & 7) << 18) | ((b[i + 1]! & 63) << 12) | ((b[i + 2]! & 63) << 6) | (b[i + 3]! & 63)), (i += 4);
    s += String.fromCodePoint(c);
    if (s.length > 8192) (parts.push(s), (s = ''));
  }
  parts.push(s);
  return parts.join('');
}

async function keyFor(password: string, salt: Uint8Array, kdf = KDF): Promise<Uint8Array> {
  return scryptAsync(utf8(password.normalize('NFKC')), salt, { N: kdf.N, r: kdf.r, p: kdf.p, dkLen: 32 });
}

export async function encryptBackup(json: string, password: string, random: (n: number) => Uint8Array, kdf = KDF): Promise<EncryptedBackup> {
  if (password.length < 8) throw new Error('Use a password of at least 8 characters');
  const salt = random(16);
  const nonce = random(12);
  const key = await keyFor(password, salt, kdf);
  const sealed = gcm(key, nonce).encrypt(utf8(json));
  return { app: 'lifeos', kind: 'encrypted-backup', v: 1, kdf: { name: 'scrypt', ...kdf, salt: toBase64(salt) }, nonce: toBase64(nonce), data: toBase64(sealed) };
}

export function isEncryptedBackup(x: unknown): x is EncryptedBackup {
  return !!x && typeof x === 'object' && (x as EncryptedBackup).kind === 'encrypted-backup' && (x as EncryptedBackup).app === 'lifeos';
}

/** The backup JSON, or throws "Wrong password (or the file was changed)". */
export async function decryptBackup(b: EncryptedBackup, password: string): Promise<string> {
  const key = await keyFor(password, fromBase64(b.kdf.salt), b.kdf);
  try {
    return fromUtf8(gcm(key, fromBase64(b.nonce)).decrypt(fromBase64(b.data)));
  } catch {
    throw new Error('Wrong password (or the file was changed)');
  }
}
