import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';

/**
 * OpenRouter in one tap (docs/MODEL.md, Connect your AI, 15 Nov): sign in on
 * OpenRouter's own page (OAuth PKCE) and the key comes back to the phone, with
 * nothing to copy. If the page cannot come back to the app, OpenRouter shows a
 * code to paste once instead (`exchangeCode`).
 */

const CALLBACK = 'lifeos://openrouter';
const AUTH = 'https://openrouter.ai/auth';

const b64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const bytes = Crypto.getRandomBytes(32);
  const verifier = b64url(btoa(String.fromCharCode(...bytes)));
  const challenge = b64url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }));
  return { verifier, challenge };
}

const authUrl = (challenge: string, callback: boolean) =>
  `${AUTH}?${callback ? `callback_url=${encodeURIComponent(CALLBACK)}&` : ''}code_challenge=${challenge}&code_challenge_method=S256&key_label=LifeOS`;

/** Trade the one-time code for the key (single use, valid 10 minutes). */
export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const r = await fetch('https://openrouter.ai/api/v1/auth/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim(), code_verifier: verifier, code_challenge_method: 'S256' }) });
  const j = (await r.json().catch(() => ({}))) as { key?: string; error?: { message?: string } };
  if (!r.ok || !j.key) throw new Error(j.error?.message ?? `OpenRouter said ${r.status}`);
  return j.key;
}

/** Sign in and get the key. `null` when you closed the page; `verifier` lets the paste-a-code fallback finish the same sign-in. */
export async function connectOpenRouter(): Promise<{ key: string | null; verifier: string }> {
  const { verifier, challenge } = await pkce();
  const res = await WebBrowser.openAuthSessionAsync(authUrl(challenge, true), CALLBACK);
  if (res.type !== 'success') return { key: null, verifier };
  const code = /[?&]code=([^&#]+)/.exec(res.url)?.[1];
  return { key: code ? await exchangeCode(decodeURIComponent(code), verifier) : null, verifier };
}

/** The fallback: OpenRouter's page with no way back, which shows a code to paste. */
export async function openCodePage(): Promise<string> {
  const { verifier, challenge } = await pkce();
  await WebBrowser.openBrowserAsync(authUrl(challenge, false));
  return verifier;
}
