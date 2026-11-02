import type { Ask, Candidate, Plain } from './contract';
import type { Skill } from './store';

/**
 * What a pass sends Claude (docs/MODEL.md layer 8, *Privacy and cost*): the
 * system part is the house rules and the Skills, the same from pass to pass so
 * the API caches it; the user part is the short list as JSON, records only.
 */

export const HOUSE_RULES = `You are the brain of LifeOS, a personal app on one person's phone. Twice a day it sends you a short list of things its code noticed in their own records (things at home running out or going off, upkeep that is due, people to keep in touch with, birthdays, football matches and money owed for them, bills and renewals, an unusual spend, papers expiring and new files, late tasks and events coming up, warranties and services). You judge what matters today, join things up where it helps, and word each one so it can be acted on in a glance.

How to answer:
- For every nudge, say keep (true or false) and its line. Keep what is worth their attention today; drop what is not (nothing is lost, it can come back tomorrow). Urgent ones (going off today, a match short tomorrow, a birthday today) are always kept.
- A line is one short sentence, under 90 characters, plain and warm, in British English. Lead with the thing ("Paneer: use it tonight, it turns tomorrow"). No greetings, no exclamation marks, no emoji, never an em dash; use a colon or a comma.
- Join things up when they touch: what to cook with what is going off, a birthday and a gift from their likes, a trip and the fridge. Do not invent facts that are not in the records; you may bring general knowledge (shelf lives, seasons, recipes, gift ideas).
- Fill every ask by its id. A list (gift ideas) is 3 to 5 short items in items, each under 40 characters; one text (a wish, a dish) goes in text. A wish is written as them, to the person, in their voice: short, specific to the person, no clichés. A dish is a name and the 3 to 5 things it uses from the list.
- remember: only facts worth keeping so the code need not ask again (how long a product keeps once opened, in days), each with a stable key like "inventory.life:paneer". Usually empty.
- skills: only when you notice a lasting rule about this person worth keeping (how they like to be reminded). Usually empty.
- LifeOS never sends, pays or orders on its own; never word a line as if it had.`;

export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nudges', 'fills', 'remember', 'skills'],
  properties: {
    nudges: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'keep', 'line'], properties: { id: { type: 'string' }, keep: { type: 'boolean' }, line: { type: 'string' } } } },
    fills: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'text', 'items'], properties: { id: { type: 'string' }, text: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } } } },
    remember: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'module', 'value'], properties: { key: { type: 'string' }, module: { type: 'string' }, value: { type: 'string' } } } },
    skills: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['module', 'name', 'body'], properties: { module: { type: 'string' }, name: { type: 'string' }, body: { type: 'string' } } } },
  },
} as const;

export interface BrainAnswer {
  nudges: Array<{ id: string; keep: boolean; line: string }>;
  fills: Array<{ id: string; text: string; items: string[] }>;
  remember: Array<{ key: string; module: string; value: string }>;
  skills: Array<{ module: string; name: string; body: string }>;
}

/** The cached part: house rules, then every Skill in a stable order. */
export function systemPrompt(skills: Skill[]): string {
  if (!skills.length) return HOUSE_RULES;
  return `${HOUSE_RULES}\n\nSkills (rules learned for this person, by module):\n${skills.map((s) => `## ${s.module} / ${s.name}\n${s.body}`).join('\n\n')}`;
}

export interface Outgoing {
  module: string;
  moduleName: string;
  candidate: Candidate;
  /** The asks still unanswered (the learned store holds the rest). */
  asks: Ask[];
}

/** The short list, as Claude reads it. Ids are n1… for nudges and a1… for asks, in order. */
export function userMessage(x: { today: string; pass: string; nudges: Outgoing[]; asks: Array<{ module: string; moduleName: string; ask: Ask }> }): { text: string; nudgeIds: Map<string, Outgoing>; askIds: Map<string, { module: string; ask: Ask }> } {
  const nudgeIds = new Map<string, Outgoing>();
  const askIds = new Map<string, { module: string; ask: Ask }>();
  let a = 0;
  const askOut = (module: string, ask: Ask) => {
    const id = `a${++a}`;
    askIds.set(id, { module, ask });
    return { id, slot: ask.slot, prompt: ask.prompt, list: !!ask.list, ...(ask.record ? { record: ask.record } : {}) };
  };
  const nudges = x.nudges.map((o, i) => {
    const id = `n${i + 1}`;
    nudgeIds.set(id, o);
    const c = o.candidate;
    return { id, module: o.moduleName, kind: c.kind, urgent: !!c.urgent, line: c.line, record: c.record, ...(o.asks.length ? { asks: o.asks.map((k) => askOut(o.module, k)) } : {}) };
  });
  const asks = x.asks.map((k) => ({ module: k.moduleName, ...askOut(k.module, k.ask) }));
  return { text: JSON.stringify({ today: x.today, pass: x.pass, nudges, asks }), nudgeIds, askIds };
}

/** The answer, read leniently (a fence or a stray line around the JSON is fine); null when it is not the shape. */
export function parseAnswer(text: string): BrainAnswer | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as Partial<BrainAnswer>;
    if (!Array.isArray(v.nudges)) return null;
    return { nudges: v.nudges, fills: Array.isArray(v.fills) ? v.fills : [], remember: Array.isArray(v.remember) ? v.remember : [], skills: Array.isArray(v.skills) ? v.skills : [] };
  } catch {
    return null;
  }
}

/** One line of the Sent to Claude log per thing that left: "Home · going off · Paneer: name=Paneer, bought=2026-10-28". */
export function sentLines(nudges: Outgoing[], asks: Array<{ moduleName: string; ask: Ask }>): string[] {
  const fields = (r: Record<string, Plain> | undefined) =>
    Object.entries(r ?? {})
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : v}`)
      .join(', ');
  return [
    ...nudges.map((o) => `${o.moduleName} · ${o.candidate.kind} · ${fields(o.candidate.record)}${o.asks.length ? ` · asks: ${o.asks.map((k) => k.slot).join(', ')}` : ''}`),
    ...asks.map((k) => `${k.moduleName} · ${k.ask.slot} · ${fields(k.ask.record)}`),
  ];
}
