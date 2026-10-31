import type { LifeOSContext } from '../registry/context';
import { HOUSE_RULES } from './prompt';

/**
 * What the brain has learned, as one Markdown file you can read, keep or hand
 * to another model (docs/MODEL.md layer 8: Skills as files you can export; the
 * training set for R12 and R14). The same rows are in every backup.
 */
export function exportBrain(os: LifeOSContext, now = Date.now()): string {
  const day = new Date(now).toISOString().slice(0, 10);
  const value = (v: unknown) => (Array.isArray(v) ? v.join('; ') : typeof v === 'string' ? v : JSON.stringify(v));
  const out = [`# LifeOS brain, exported ${day}`, '', '## House rules', '', HOUSE_RULES, '', '## Skills', ''];
  const skills = os.brain.skills.all();
  if (!skills.length) out.push('None yet.', '');
  for (const s of skills) out.push(`### ${s.module} / ${s.name} (${s.source})`, '', s.body, '');
  out.push('## Learned', '');
  const learned = os.brain.learned.all();
  if (!learned.length) out.push('Nothing yet.', '');
  for (const l of learned) out.push(`- \`${l.key}\` (${l.kind}, ${l.source}): ${value(l.value)}`);
  return `${out.join('\n').trimEnd()}\n`;
}
