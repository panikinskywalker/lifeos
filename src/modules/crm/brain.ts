import { keyHash, type Ask, type BrainDef, type Candidate, type Nudge } from '@core/brain/contract';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { nextBirthday } from './lib';
import { cadenceLabel, listItems, type PersonData } from './types';
import { daysSince } from './people';

/**
 * What People brings the brain (docs/MODEL.md layer 8): *due* (keep in touch,
 * from the person.contact Cycle) and *coming up* (a birthday within a week).
 * Gift ideas (from their Likes) and the drafted wish are asks that fill the
 * board's existing slots; Yes opens the call or WhatsApp with the wish: the
 * last step is yours. What leaves: name, relationship, days since you spoke,
 * Likes, the age; never a number or a message.
 */

const DAY = 86_400_000;
const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const digits = (phone: string | undefined) => (phone ?? '').replace(/\D/g, '');
const people = (os: LifeOSContext) => os.records.query<PersonData>('person', {}, { limit: 5000 }).filter((p) => !p.archived);

function upcoming(p: ObjectRecord<PersonData>, now: number) {
  if (!p.data.birthday) return null;
  const b = nextBirthday(p.data.birthday, new Date(now));
  if (!b) return null;
  return { ...b, year: new Date(now + b.days * DAY).getFullYear() };
}

/** The learned key for gift ideas: this person and these Likes (new Likes, new ideas). */
export function giftIdeasKey(p: ObjectRecord<PersonData>): string | null {
  const likes = listItems(p.data.likes);
  return likes.length ? `crm:gifts:${p.id}:${keyHash(likes.map((l) => l.toLowerCase()))}` : null;
}

/** The learned key for this year's wish (the next birthday's year). */
export function wishKey(p: ObjectRecord<PersonData>, now = Date.now()): string | null {
  const b = upcoming(p, now);
  return b ? `crm:wish:${p.id}:${b.year}` : null;
}

function keepInTouch(os: LifeOSContext, now: number): Candidate[] {
  const out: Candidate[] = [];
  for (const p of people(os)) {
    const c = os.cycles.forEntity(p.id).find((x) => x.template === 'person.contact' && x.enabled && x.nextDueAt != null);
    if (!c || c.nextDueAt! > now || (c.snoozedUntil && c.snoozedUntil > now)) continue;
    const since = daysSince(p.data.lastContactAt, now);
    out.push({
      key: `crm:touch:${p.id}:${c.nextDueAt}`,
      kind: 'due',
      shape: 'ask',
      subjectId: p.id,
      title: p.title,
      line: since != null ? `${first(p.title)}: ${since} days since you spoke` : `Time to catch up with ${first(p.title)}`,
      record: { name: p.title, relationship: p.data.relationship ?? null, keep_in_touch: cadenceLabel(p.data.contactEvery), days_since_spoke: since },
      rank: 5 - Math.round((now - c.nextDueAt!) / DAY),
      yes: digits(p.data.phone) ? 'Call' : 'Open',
      payload: { personId: p.id, what: 'touch' },
    });
  }
  return out;
}

function birthdays(os: LifeOSContext, now: number): Candidate[] {
  const out: Candidate[] = [];
  for (const p of people(os)) {
    const b = upcoming(p, now);
    if (!b || b.days > 7) continue;
    const when = b.days === 0 ? 'today' : b.days === 1 ? 'tomorrow' : `in ${b.days} days`;
    out.push({
      key: `crm:bday:${p.id}:${b.year}`,
      kind: 'coming up',
      shape: 'ask',
      subjectId: p.id,
      title: p.title,
      line: `${first(p.title)}’s birthday ${when}${b.age ? `: turns ${b.age}` : ''}`,
      record: { name: p.title, relationship: p.data.relationship ?? null, birthday_in_days: b.days, turns: b.age, likes: listItems(p.data.likes) },
      urgent: b.days === 0,
      rank: b.days,
      yes: b.days <= 1 && digits(p.data.phone) ? 'Send wish' : 'Open',
      payload: { personId: p.id, what: 'birthday' },
    });
  }
  return out;
}

function asks(os: LifeOSContext, now: number): Ask[] {
  const out: Ask[] = [];
  for (const p of people(os)) {
    const b = upcoming(p, now);
    if (!b || b.days > 14) continue;
    const likes = listItems(p.data.likes);
    const base = { name: p.title, relationship: p.data.relationship ?? null, turns: b.age, likes };
    const gifts = giftIdeasKey(p);
    if (gifts) out.push({ key: gifts, slot: `gift ideas for ${first(p.title)}`, prompt: `Gift ideas for ${first(p.title)}'s birthday, drawn from their likes; things you can buy or book in India.`, record: base, list: true });
    if (b.days <= 1) out.push({ key: wishKey(p, now)!, slot: `wish for ${first(p.title)}`, prompt: `A birthday wish to ${first(p.title)}, two or three short sentences, in the user's voice.`, record: base });
  }
  return out;
}

export const crmBrain: BrainDef = {
  candidates: (os, now) => [...keepInTouch(os, now), ...birthdays(os, now)],
  asks,
  act(os, verb, nudge: Nudge) {
    if (verb !== 'yes') return null;
    const { personId, what } = (nudge.payload ?? {}) as { personId?: string; what?: string };
    const p = personId ? os.records.get<PersonData>(personId) : undefined;
    if (!p) return null;
    const n = digits(p.data.phone);
    if (!n) return { open: `/entity/person/${p.id}` };
    if (what === 'birthday') {
      const key = wishKey(p, nudge.createdAt);
      const wish = key ? os.brain.learned.get<string>(key) : undefined;
      if (wish) return { open: `https://wa.me/${n}?text=${encodeURIComponent(wish)}` };
    }
    return { open: `tel:${n}` };
  },
  skills: [{ name: 'People', body: 'Use first names. A birthday today is the one thing that must not be missed. Keep-in-touch lines say how long it has been, never scold. Gift ideas come from their likes, not from guesses about them.' }],
};
