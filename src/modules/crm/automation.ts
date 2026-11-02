import type { ActionDef, AutomationTemplate } from '@core/registry/types';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { PersonData } from './types';
import { daysSince } from './people';

/**
 * People's part in automations (docs/MODEL.md layer 3, R10): who is due a
 * catch-up, as a step's output, and the Contact nudge template built on it.
 */

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** People whose keep-in-touch Cycle is due, the longest overdue first. */
export function dueToContact(os: LifeOSContext, now = Date.now()): Array<{ person: ObjectRecord<PersonData>; dueAt: number; days: number | null }> {
  const out: Array<{ person: ObjectRecord<PersonData>; dueAt: number; days: number | null }> = [];
  for (const p of os.records.query<PersonData>('person', {}, { limit: 5000 })) {
    if (p.archived) continue;
    const c = os.cycles.forEntity(p.id).find((x) => x.template === 'person.contact' && x.enabled && x.nextDueAt != null);
    if (!c || c.nextDueAt! > now || (c.snoozedUntil && c.snoozedUntil > now)) continue;
    out.push({ person: p, dueAt: c.nextDueAt!, days: daysSince(p.data.lastContactAt, now) ?? null });
  }
  return out.sort((a, b) => a.dueAt - b.dueAt);
}

export const crmActions: ActionDef[] = [
  {
    id: 'crm.dueToContact', module: 'crm', label: 'Find who’s due a catch-up',
    description: 'From each person’s keep-in-touch',
    outputs: ['count', 'names', 'first', 'name', 'id', 'days'],
    run: async (_cfg, _ctx, os) => {
      const due = dueToContact(os);
      const top = due[0];
      return {
        line: due.length ? `${due.length} due: ${due.slice(0, 3).map((d) => d.person.title).join(', ')}` : 'No one is due',
        output: { count: due.length, names: due.map((d) => d.person.title).join(', '), first: top ? first(top.person.title) : '', name: top?.person.title ?? '', id: top?.person.id ?? '', days: top?.days ?? '' },
      };
    },
  },
];

export const crmTemplates: AutomationTemplate[] = [
  {
    id: 'crm.contactNudge', name: 'Contact nudge',
    description: 'Each morning, if someone is due a catch-up, Claude drafts an opening line and you get it as a notification.',
    trigger: { id: 'core.schedule.daily', config: { time: '10:00' } },
    conditions: [],
    steps: [
      { action: 'crm.dueToContact', config: {} },
      { action: 'core.continueIf', config: { field: 'steps.s1.count', op: 'gt', value: '0' } },
      { action: 'core.askModel', config: { prompt: 'Write one short, warm opening line for a WhatsApp message to {{steps.s1.first}}, whom I last spoke to {{steps.s1.days}} days ago. Just the line.', maxTokens: 120, fallback: 'Hey {{steps.s1.first}}, it’s been a while! How are you?' } },
      { action: 'core.notify', config: { title: 'Catch up with {{steps.s1.first}}', body: '{{steps.s3.text}}' } },
    ],
  },
];
