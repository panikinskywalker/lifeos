import type { LifeOSContext } from '../registry/context';
import { recordUsage } from '../ai/routing';
import type { Plain } from './contract';
import type { BrainImage, BrainModel } from './model';
import { brainSettings } from './runner';

/**
 * A photo you sent on purpose (docs/MODEL.md layer 8, *Privacy and cost*;
 * Snap the fridge): one call with the photo and a few records, outside the
 * passes. The budget is checked first; the Sent to Claude log says a photo
 * left and lists the records, but keeps neither the photo nor anything from
 * it. Nothing here stores the image.
 */

export interface PhotoAsk {
  module: string;
  moduleName: string;
  /** Why it left, for the log ("you pressed Snap the fridge"). */
  why: string;
  /** What the photo is, for the log ("a photo of the fridge"). */
  what: string;
  system: string;
  prompt: string;
  /** The records that go with it; the only text that leaves. */
  record: Record<string, Plain>;
  schema: Record<string, unknown>;
  image: BrainImage;
  maxTokens?: number;
}

export type PhotoResult = { ok: true; answer: unknown } | { ok: false; note: 'off' | 'no key' | 'over budget' | 'error'; error?: string };

/** A photo is about 1,600 tokens at most once the API scales it. */
const PHOTO_TOKENS = 1600;

const fields = (r: Record<string, Plain>) =>
  Object.entries(r)
    .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : v}`)
    .join(', ');

export async function askWithPhoto(os: LifeOSContext, model: BrainModel | null, ask: PhotoAsk, now = Date.now()): Promise<PhotoResult> {
  if (!brainSettings(os).on) return { ok: false, note: 'off' };
  if (!model) return { ok: false, note: 'no key' };
  const maxTokens = ask.maxTokens ?? 1500;
  const user = `${ask.prompt}\n\n${JSON.stringify(ask.record)}`;
  const estimate = PHOTO_TOKENS + Math.ceil((ask.system.length + user.length) / 4) + maxTokens;
  if (os.brain.sent.tokensToday(now) + estimate > brainSettings(os).budget) return { ok: false, note: 'over budget' };
  const lines = [`${ask.moduleName} · ${ask.what}: read once, not kept`, `${ask.moduleName} · ${fields(ask.record)}`];
  const base = { at: now, pass: 'photo', why: ask.why, model: model.model, lines, records: 1 };
  try {
    const r = await model.complete({ system: ask.system, user, maxTokens, schema: ask.schema, image: ask.image });
    const answer = parseJson(r.text);
    os.brain.sent.add({ ...base, ...r.usage, outcome: answer == null ? 'error' : 'ok', error: answer == null ? 'The answer was not the expected JSON' : null });
    recordUsage(os, { provider: 'claude', model: model.model, purpose: 'brain', input: r.usage.input + r.usage.cacheRead + r.usage.cacheWrite, output: r.usage.output, at: now });
    return answer == null ? { ok: false, note: 'error', error: 'The answer was not the expected JSON' } : { ok: true, answer };
  } catch (e) {
    const usage = (e as { usage?: { input: number; output: number; cacheRead: number; cacheWrite: number } }).usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    os.brain.sent.add({ ...base, ...usage, outcome: 'error', error: (e as Error).message.slice(0, 300) });
    return { ok: false, note: 'error', error: (e as Error).message };
  }
}

function parseJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
