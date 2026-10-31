import type { LifeOSContext } from '../registry/context';
import { brains, lastPassToday, type PassName } from './runner';
import { startOfDay } from './store';

/**
 * The Morning brief on Today (docs/MODEL.md layer 8): today's nudges in a few
 * lines, urgent first, each opening its record or its To check card, then the
 * fills meant for the brief (Home's Cook tonight). The evening pass updates it.
 */

export interface BriefLine {
  id: string;
  text: string;
  module: string;
  urgent: boolean;
  /** Where the line goes: the record, a screen, or To check. */
  route: string;
  /** You already answered its card (shown quieter). */
  answered: boolean;
}

export interface Brief {
  lines: BriefLine[];
  /** The last pass today, for "Updated 7 pm"; null before the first one. */
  pass: { at: number; pass: PassName } | null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function brief(os: LifeOSContext, now = Date.now(), max = 6): Brief {
  const lines: BriefLine[] = [];
  for (const n of os.brain.nudges.since(startOfDay(now))) {
    if (n.state === 'no' || n.state === 'undone') continue;
    const rec = n.recordId ? os.records.get(n.recordId) : undefined;
    lines.push({ id: n.id, text: n.line, module: n.module, urgent: n.urgent, route: n.route ?? (rec ? `/entity/${rec.object}/${rec.id}` : '/check'), answered: n.state !== 'open' });
  }
  lines.sort((a, b) => Number(b.urgent) - Number(a.urgent) || Number(a.answered) - Number(b.answered));
  const out = lines.slice(0, max);
  for (const b of brains(os)) {
    let asks: ReturnType<NonNullable<typeof b.def.asks>> = [];
    try {
      asks = b.def.asks?.(os, now) ?? [];
    } catch {
      asks = [];
    }
    for (const a of asks) {
      if (!a.brief) continue;
      const v = os.brain.learned.get<string | string[]>(a.key);
      if (!v) continue;
      out.push({ id: a.key, text: `${cap(a.slot)}: ${Array.isArray(v) ? v.join(', ') : v}`, module: b.module, urgent: false, route: a.route ?? '/check', answered: false });
    }
  }
  return { lines: out, pass: lastPassToday(os, now) };
}
