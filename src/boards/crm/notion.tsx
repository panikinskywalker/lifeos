import React from 'react';
import { View } from 'react-native';
import type { Filing } from '@core/repo/filingRepo';
import { answerNotionMatch, notionConflictOf, notionMatchOf, NOTION_FIELD_LABEL, takeOtherNotionValue, type PersonData } from '@modules/crm';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Text, useToast } from '@ui/kit';
import { Face, Label } from './parts';
import { Card, Hairline, SmallPill, WidePill } from './whois';

/**
 * Notion in To check (R2b; docs/MODEL.md layer 4): the two questions the
 * notion source asks, each once. Drawn like the Who is this? cards
 * (NR-People-WhoIs): an unsure match ("Is Notion’s “Rahul” one of your
 * People?" — This · Someone new) and a Field changed on both sides (what was
 * kept, and the other value, so nothing is lost silently — Keep · Use the
 * other). The crm board registers them as `checkCards`.
 */

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function NotionMark() {
  const t = useTheme();
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="notebook" size={20} color={t.c.fg.primary} />
    </View>
  );
}

/** notion-match: which Person is this page? */
export function NotionMatchCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const ask = notionMatchOf(filing.before);
  const people = useLive((o) => (ask?.candidates ?? []).map((id) => o.records.get<PersonData>(id)).filter((p): p is NonNullable<typeof p> => !!p), [filing.id]);
  if (!ask) return null;
  const answer = (id: string | 'new', name: string) => {
    answerNotionMatch(os, filing.id, id);
    toast.show({ message: id === 'new' ? `${name} added · kept in step with Notion from the next sync` : `Linked to ${firstName(name)} · kept in step from the next sync`, icon: 'check' });
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <NotionMark />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="heading">Is Notion’s “{ask.name}” one of these?</Text>
          <Text variant="caption" color="secondary" numberOfLines={2}>
            A page in your People CRM LifeOS isn’t sure about
          </Text>
        </View>
      </View>
      {people.length ? <Label>Could be</Label> : null}
      <View style={{ gap: 8 }}>
        {people.map((p, i) => (
          <React.Fragment key={p.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
              <Face id={p.id} name={p.title} photo={p.data.photo?.uri} size={40} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="rowTitle" numberOfLines={1}>
                  {p.title}
                </Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {[p.data.city, p.data.company, p.data.phone || p.data.email].filter(Boolean).join(' · ') || 'No details yet'}
                </Text>
              </View>
              <SmallPill title="This" lime={i === 0} label={`Notion’s ${ask.name} is ${p.title}`} onPress={() => answer(p.id, p.title)} />
            </View>
            <Hairline />
          </React.Fragment>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <WidePill title="Someone new" icon="plus" onPress={() => answer('new', ask.name)} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: t.c.bg.tileRaised }}>
        <Icon name="info" size={16} color={t.c.fg.secondary} />
        <Text variant="caption" color="secondary" style={{ flex: 1 }}>
          Asked once. The page stays as it is until you answer.
        </Text>
      </View>
    </Card>
  );
}

/** notion-conflict: changed in both, the later edit kept; the other value one tap away. */
export function NotionConflictCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const toast = useToast();
  const c = notionConflictOf(filing.before);
  const person = useLive((o) => (filing.entityId ? o.records.get<PersonData>(filing.entityId) ?? null : null), [filing.entityId]);
  if (!c) return null;
  const field = NOTION_FIELD_LABEL[c.key] ?? c.key;
  const other = c.lost ? `Use ‘${c.lost.length > 24 ? `${c.lost.slice(0, 23)}…` : c.lost}’` : 'Clear it';
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        {person ? <Face id={person.id} name={person.title} photo={person.data.photo?.uri} size={40} /> : <NotionMark />}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="rowTitle" numberOfLines={3}>
            {filing.label}
          </Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {`${field} changed in Notion and in LifeOS · the later edit was kept`}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <WidePill
          title="Keep"
          icon="check"
          lime
          onPress={() => {
            os.filings.setChecked(filing.id);
            toast.show({ message: `Kept ${c.kept ? `‘${c.kept}’` : 'it empty'}`, icon: 'check' });
          }}
        />
        <WidePill
          title={other}
          icon="refresh"
          onPress={() => {
            takeOtherNotionValue(os, filing.id);
            toast.show({ message: `${field} is ${c.lost ? `‘${c.lost}’` : 'empty'} now · Notion hears on the next sync`, icon: 'check' });
          }}
        />
      </View>
    </Card>
  );
}
