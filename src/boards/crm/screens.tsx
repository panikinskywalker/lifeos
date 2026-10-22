import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Chip, EmptyState, IconButton, RowItem, RowList, Screen, Section, Text } from '@ui/kit';
import { daysSince, nextBirthday, peopleToCall, type GroupData, type PersonData } from '@modules/crm';
import { Avatar } from './avatar';

/**
 * People home (the crm board's index): the People strip (NR-KitRecords: 56
 * discs, a lime ring = something due), who to call or message, birthdays
 * coming, and your groups.
 */
export function PeopleHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const data = useLive((os) => {
    const people = os.records.query<PersonData>('person', {}, { limit: 5000 });
    const due = peopleToCall(os, { withinDays: 7, birthdayDays: 14, limit: 30 });
    const dueIds = new Set(due.map((d) => d.id));
    // The strip: who is due first, then starred, then whoever you spoke to last.
    const strip = [...people]
      .sort((a, b) => Number(dueIds.has(b.id)) - Number(dueIds.has(a.id)) || Number(b.starred) - Number(a.starred) || (b.data.lastContactAt ?? '').localeCompare(a.data.lastContactAt ?? '') || a.title.localeCompare(b.title))
      .slice(0, 20);
    const birthdays = people
      .map((p) => ({ p, b: p.data.birthday ? nextBirthday(p.data.birthday) : null }))
      .filter((x) => x.b && x.b.days <= 30)
      .sort((a, b) => a.b!.days - b.b!.days)
      .slice(0, 6);
    const groups = os.records.query<GroupData>('group', { sort: [{ field: 'title', dir: 'asc' }] }, { limit: 50 });
    return { count: people.length, strip, due, dueIds, birthdays, groups };
  }, []);
  const ink = t.c.accent.mustard;

  return (
    <Screen title="People" subtitle={`${data.count} ${data.count === 1 ? 'person' : 'people'}`} right={<IconButton icon="plus" filled accessibilityLabel="Add a person" onPress={() => router.push('/entity/person/new')} />}>
      <View style={{ gap: 20 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label="Everyone" icon="people" onPress={() => router.push('/entity/person')} />
          <Chip label="Groups" icon="people" onPress={() => router.push('/entity/group')} />
          <Chip label="Pick contacts" icon="phone" onPress={() => router.push('/settings/contacts')} />
        </ScrollView>

        {data.strip.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {data.strip.map((p) => {
              const due = data.dueIds.has(p.id);
              return (
                <Pressable key={p.id} onPress={() => router.push(`/entity/person/${p.id}`)} accessibilityRole="button" accessibilityLabel={due ? `${p.title}, due` : p.title} style={{ width: 64, alignItems: 'center', gap: 6 }}>
                  <Avatar id={p.id} name={p.title} photo={p.data.photo?.uri} size={56} ring={due ? ink : "transparent"} dot={due ? ink : undefined} />
                  <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: t.c.fg.secondary }}>{p.title.split(' ')[0]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <EmptyState icon="people" tint="people" line="No one yet. Pick people from your contacts, or add someone." action="Pick contacts" onAction={() => router.push('/settings/contacts')} />
        )}

        {data.due.length ? (
          <Section title="Call or message" meta={String(data.due.length)}>
            <RowList>
              {data.due.slice(0, 8).map((d) => {
                const ago = daysSince(d.lastSpoke);
                return <RowItem key={`${d.id}-${d.reason}`} title={d.name} subtitle={ago == null ? 'Never logged' : ago === 0 ? 'Spoke today' : `Last spoke ${ago} d ago`} icon={d.reason === 'birthday' ? 'cake' : 'phone'} tint="people" value={d.why} valueTone={d.late ? 'alert' : 'secondary'} onPress={() => router.push(`/entity/person/${d.id}`)} />;
              })}
            </RowList>
          </Section>
        ) : null}

        {data.birthdays.length ? (
          <Section title="Birthdays coming up">
            <RowList>
              {data.birthdays.map(({ p, b }) => (
                <RowItem key={p.id} title={p.title} subtitle={b!.age ? `Turns ${b!.age}` : null} icon="gift" tint="people" value={b!.days === 0 ? 'Today' : `${b!.days} d`} onPress={() => router.push(`/entity/person/${p.id}`)} />
              ))}
            </RowList>
          </Section>
        ) : null}

        {data.groups.length ? (
          <Section title="Groups" action="All" onAction={() => router.push('/entity/group')}>
            <RowList>
              {data.groups.slice(0, 6).map((g) => (
                <RowItem key={g.id} title={g.title} subtitle={`${g.data.memberIds.length} member${g.data.memberIds.length === 1 ? '' : 's'} + you`} icon="people" tint="people" chevron onPress={() => router.push(`/entity/group/${g.id}`)} />
              ))}
            </RowList>
          </Section>
        ) : null}
      </View>
    </Screen>
  );
}
