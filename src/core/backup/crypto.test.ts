import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptBackup, encryptBackup, fromBase64, toBase64 } from './crypto';

const random = (n: number) => new Uint8Array(randomBytes(n));
const FAST = { N: 2 ** 10, r: 8, p: 1 }; // tests only; backups use 2^15

describe('encrypted backups', () => {
  it('base64 round-trips any length', () => {
    for (const n of [0, 1, 2, 3, 4, 31, 256]) {
      const b = random(n);
      expect(Array.from(fromBase64(toBase64(b)))).toEqual(Array.from(b));
    }
  });
  it('sealed with the password; the right one opens it, a wrong one or a changed byte does not', async () => {
    const json = JSON.stringify({ app: 'lifeos', tables: { entities: [{ id: 'a', title: 'Kendal — ₹450' }] } });
    const enc = await encryptBackup(json, 'correct horse', random, FAST);
    expect(enc.data).not.toContain('Kendal');
    expect(await decryptBackup(enc, 'correct horse')).toBe(json);
    await expect(decryptBackup(enc, 'wrong horse!')).rejects.toThrow('Wrong password');
    const tampered = { ...enc, data: toBase64(fromBase64(enc.data).map((x, i) => (i === 5 ? x ^ 1 : x))) };
    await expect(decryptBackup(tampered, 'correct horse')).rejects.toThrow('Wrong password');
    await expect(encryptBackup(json, 'short', random, FAST)).rejects.toThrow('at least 8');
  });
});
