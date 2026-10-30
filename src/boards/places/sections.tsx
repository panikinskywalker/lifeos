import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDistanceToNowStrict } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { childPlaces, distanceKm, homePlace, lastBeen, orgsAt, parentChain, spentAt, visitsOf, ORG_KINDS, type OrgData, type PlaceData } from '@modules/places';
import { useLive } from '@ui/hooks';
import { RowItem, RowList, Section, StatTrio } from '@ui/kit';
import { kindIcon, kindLabel, PlaceCard, PlaceMap } from './art';

/** Place and Organisation record sections (R3): the Place · card and the map on top; visits, what is inside and who is here below. */

type Props = { entity: ObjectRecord<any>; ctx: LifeOSContext }; // eslint-disable-line @typescript-eslint/no-explicit-any

const ago = (days: number | null) => (days == null ? null : days === 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} d ago` : days < 365 ? `${Math.round(days / 30)} mo ago` : `${Math.round(days / 365)} y ago`);

/** The card's one line: what it is in, the address, when you were last there and how far from home. */
export function placeLine(os: LifeOSContext, p: ObjectRecord<PlaceData>, now = Date.now()): string {
  const home = homePlace(os);
  const km = home && home.id !== p.id && home.data.coordinates && p.data.coordinates ? distanceKm(home.data.coordinates, p.data.coordinates) : null;
  const been = ago(lastBeen(os, p.id, now));
  return [parentChain(os, p).slice(0, 2).map((x) => x.title).join(', ') || null, p.data.address ?? null, been ? `last here ${been}` : null, km != null ? `${km < 10 ? km.toFixed(1) : Math.round(km)} km from home` : null].filter(Boolean).join(' · ');
}

export function PlaceHero({ entity }: Props) {
  const data = useLive(
    (os) => {
      const p = os.records.get<PlaceData>(entity.id);
      if (!p) return null;
      const home = homePlace(os);
      const km = home && home.id !== p.id && home.data.coordinates && p.data.coordinates ? distanceKm(home.data.coordinates, p.data.coordinates) : null;
      return { p, visits: visitsOf(os, p.id, { inside: true }).length, line: placeLine(os, p), km };
    },
    [entity.id, entity.version],
  );
  if (!data) return null;
  const { p } = data;
  const mappable = !!(p.data.coordinates || p.data.mapsUrl || p.data.address);
  return (
    <View style={{ gap: 12 }}>
      <PlaceCard place={p} badge={{ icon: kindIcon(p.data.kind), color: '#F6E27F', label: data.visits ? `${data.visits} visit${data.visits === 1 ? '' : 's'}` : kindLabel(p.data.kind) }} pill={kindLabel(p.data.kind)} line={data.line || null} />
      {mappable ? <PlaceMap place={p} km={data.km} /> : null}
    </View>
  );
}

export function PlaceBody({ entity, ctx }: Props) {
  const router = useRouter();
  const data = useLive(
    (os) => {
      const visits = visitsOf(os, entity.id, { inside: true });
      const month = new Date();
      month.setDate(1);
      return {
        visits,
        inside: childPlaces(os, entity.id),
        orgs: orgsAt(os, entity.id),
        spent: spentAt(os, entity.id),
        spentMonth: spentAt(os, entity.id, month.toISOString().slice(0, 10)),
        last: lastBeen(os, entity.id),
      };
    },
    [entity.id, entity.version],
  );
  const open = (object: string, id: string) => router.push(`/entity/${object}/${id}` as never);
  return (
    <View style={{ gap: 16 }}>
      <StatTrio
        stats={[
          { label: 'Visits', value: String(data.visits.length) },
          { label: 'Last here', value: ago(data.last) ?? '—' },
          { label: 'Spent here', value: data.spent.count ? ctx.format.currency(data.spent.total) : '—', caption: data.spentMonth.count ? `${ctx.format.currency(data.spentMonth.total)} this month` : undefined },
        ]}
      />
      {data.visits.length ? (
        <Section title="Visits" meta={String(data.visits.length)}>
          <RowList>
            {data.visits.slice(0, 8).map((v) => (
              <RowItem key={v.id} icon="calendar" tint="travel" title={v.title} subtitle={v.kind ?? null} value={formatDistanceToNowStrict(v.at, { addSuffix: true })} chevron onPress={() => open('event', v.id)} />
            ))}
          </RowList>
        </Section>
      ) : null}
      {data.orgs.length ? (
        <Section title="Here">
          <RowList>
            {data.orgs.map((o) => (
              <RowItem key={o.id} icon={ORG_KINDS.find((k) => k.value === o.data.kind)?.icon ?? 'briefcase'} tint="finance" title={o.title} subtitle={ORG_KINDS.find((k) => k.value === o.data.kind)?.label ?? null} chevron onPress={() => open('org', o.id)} />
            ))}
          </RowList>
        </Section>
      ) : null}
      {data.inside.length ? (
        <Section title="Inside" meta={String(data.inside.length)}>
          <RowList>
            {data.inside.map((c) => (
              <RowItem key={c.id} icon={kindIcon(c.data.kind)} tint="travel" title={c.title} subtitle={kindLabel(c.data.kind)} chevron onPress={() => open('place', c.id)} />
            ))}
          </RowList>
        </Section>
      ) : null}
    </View>
  );
}

/** Organisation: what you paid them, how often, and the branch you go to. */
export function OrgSection({ entity, ctx }: Props) {
  const router = useRouter();
  const data = useLive(
    (os) => {
      const o = os.records.get<OrgData>(entity.id);
      if (!o) return null;
      const month = new Date().toISOString().slice(0, 8) + '01';
      let total = 0;
      let count = 0;
      let monthTotal = 0;
      for (const r of os.links.forEntity(o.id, 'payee')) {
        if (r.direction !== 'in' || r.other.object !== 'transaction') continue;
        const t = os.records.get<{ amount?: number; kind?: string; date?: string }>(r.other.id);
        if (!t || t.data.kind !== 'expense') continue;
        total += t.data.amount ?? 0;
        count++;
        if ((t.data.date ?? '') >= month) monthTotal += t.data.amount ?? 0;
      }
      const at = o.data.placeId ? os.records.get<PlaceData>(o.data.placeId) : undefined;
      const mails = os.records.timeline.forEntity(o.id).filter((t) => t.kind === 'email').length;
      return { total, count, monthTotal, at, mails, line: at ? placeLine(os, at) : null };
    },
    [entity.id, entity.version],
  );
  if (!data) return null;
  return (
    <View style={{ gap: 16 }}>
      <StatTrio
        stats={[
          { label: 'This month', value: data.monthTotal ? ctx.format.currency(data.monthTotal) : '—' },
          { label: 'Payments', value: String(data.count), caption: data.count ? ctx.format.currency(data.total) : undefined },
          { label: 'Mail', value: String(data.mails) },
        ]}
      />
      {data.at ? <PlaceCard place={data.at} badge={{ icon: kindIcon(data.at.data.kind), color: '#F6E27F', label: kindLabel(data.at.data.kind) }} line={data.line} onPress={() => router.push(`/entity/place/${data.at!.id}` as never)} /> : null}
    </View>
  );
}
