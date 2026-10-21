import { useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { runSource } from '@core/filing/sources';
import { sourceState } from '@core/sources/deviceData';
import { allGames, allPlayers, allVenues, currentGame, mePersonId, leaders, lineup, moneyAtAGlance, statsFor, summarise, whoOwes, ATTENDANCE, PAYMENT_TERMS, type LeaderMetric } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { Button, Card, EmptyState, RowItem, RowList, Screen, Section, Segmented, Stat, StatTrio, Text, useToast } from '@ui/kit';

/**
 * The Turf board (docs/MODEL.md layer 3; R9a, R9c; read-only until R9c.2):
 * Turf Ledger's flow, synced from Turf web — Home (money at a glance, who still owes, this week's game), Games
 * (match centre and history), Players (squad and leaders), Venues — over the
 * games, crm, places and finance records. Restyled with the redesign later.
 */

type Props = { ctx: LifeOSContext; params: Record<string, string> };

const TINT = 'health' as const;
const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function useBack() {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/browse'));
}

const EVERY_MS = 60_000;
/** One sync at a time, however many board screens are open. */
let inFlight = false;
const stale = (os: LifeOSContext) => Date.now() - (sourceState(os, 'turf').lastSync ?? 0) > EVERY_MS - 5_000;

/**
 * A Turf web sync through core: when a board screen opens (if the last one is
 * over a minute old), every minute while it stays open, and on pull-to-refresh.
 * Only the pull-down says what went wrong; the quiet ones leave it on the
 * source's state (You › Data sources).
 */
function usePull() {
  const os = useOS();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pull = async (quiet = false) => {
    const src = os.registry.sources.get('turf');
    if (!src || inFlight) return;
    inFlight = true;
    if (!quiet) setBusy(true);
    try {
      if (src.available && !(await src.available(os))) {
        if (!quiet) toast.show({ message: 'Add Turf web’s address and this phone’s key first', icon: 'info' });
      } else await runSource(os, src);
    } catch (e) {
      if (!quiet) toast.show({ message: (e as Error).message, icon: 'info' });
    } finally {
      inFlight = false;
      if (!quiet) setBusy(false);
    }
  };
  useEffect(() => {
    if (stale(os)) void pull(true);
    const timer = setInterval(() => stale(os) && void pull(true), EVERY_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os]);
  return { busy, pull };
}

function NotConnected() {
  const router = useRouter();
  return (
    <View style={{ gap: 12 }}>
      <EmptyState icon="target" line="Connect Turf web to see your matches, players and who owes what." />
      <Button title="Connect Turf web" icon="link" onPress={() => router.push('/settings/turf' as never)} />
    </View>
  );
}

/* ------------------------------------------------------------------ */

export function TurfHome({ ctx }: Props) {
  const router = useRouter();
  const back = useBack();
  const { busy, pull } = usePull();
  const data = useLive((o) => {
    const players = allPlayers(o).length;
    if (!players) return null;
    const cur = currentGame(o);
    return { money: moneyAtAGlance(o), owing: whoOwes(o).slice(0, 8), cur, sum: cur ? summarise(o, cur.game) : null, players, state: sourceState(o, 'turf'), me: mePersonId(o) };
  }, []);
  const f = ctx.format.currency;
  return (
    <Screen title="Turf" subtitle={data?.state.lastSync ? `From Turf web · synced ${formatDistanceToNow(data.state.lastSync, { addSuffix: true })}` : 'From Turf web'} onBack={back} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      {!data ? (
        <NotConnected />
      ) : (
        <>
          <StatTrio
            stats={[
              { label: 'Still owed', value: f(data.money.outstanding), tone: data.money.outstanding ? 'alert' : undefined },
              { label: 'Owing', value: String(data.money.owingPeople) },
              { label: 'Games this month', value: String(data.money.gamesThisMonth) },
            ]}
          />
          {data.cur && data.sum ? (
            <Section title={data.cur.upcoming ? 'Next game' : 'Last game'} action="All games" onAction={() => router.push('/board/turf/games' as never)}>
              <RowList>
                <RowItem
                  icon="target"
                  tint={TINT}
                  title={data.cur.game.title}
                  subtitle={[data.cur.game.data.time, `${data.sum.players} / ${data.cur.game.data.expectedPlayers || data.sum.players} players`, data.cur.game.data.scoreA != null ? `${data.cur.game.data.scoreA}–${data.cur.game.data.scoreB}` : null].filter(Boolean).join(' · ')}
                  value={f(data.cur.game.data.totalCost)}
                  meta={data.sum.outstanding ? `${f(data.sum.outstanding)} to collect` : 'All paid'}
                  metaTone={data.sum.outstanding ? 'alert' : 'ok'}
                  chevron
                  onPress={() => router.push(`/board/turf/game?game=${data.cur!.game.id}` as never)}
                />
              </RowList>
            </Section>
          ) : null}
          <Section title="Who still owes" meta={data.owing.length ? undefined : 'Nobody'}>
            {data.owing.length ? (
              <RowList>
                {data.owing.map((o) => (
                  <RowItem key={o.personId} icon="user" tint={TINT} title={o.personId === data.me ? `${o.name} (you)` : o.name} subtitle={`${o.shares} game${o.shares === 1 ? '' : 's'} · since ${shortDay(o.oldest)}`} value={f(o.amount)} valueTone="alert" strong onPress={() => router.push(`/entity/person/${o.personId}` as never)} />
                ))}
              </RowList>
            ) : (
              <Text variant="caption" color="secondary">
                Every share is paid.
              </Text>
            )}
          </Section>
          <Section title="On this board">
            <RowList>
              <RowItem icon="calendar" tint={TINT} title="Games" subtitle="Match centre and history" chevron onPress={() => router.push('/board/turf/games' as never)} />
              <RowItem icon="people" tint={TINT} title="Players" subtitle={`Squad of ${data.players} · leaders`} chevron onPress={() => router.push('/board/turf/players' as never)} />
              <RowItem icon="location" tint={TINT} title="Venues" chevron onPress={() => router.push('/board/turf/venues' as never)} />
              <RowItem icon="settings" tint={TINT} title="Turf web settings" subtitle="Address, key, which player is you" chevron onPress={() => router.push('/settings/turf' as never)} />
            </RowList>
          </Section>
          <Text variant="caption" color="tertiary">
            Read-only for now. Syncs from Turf web every minute while open; pull down to sync now. Changes made here reach the web app in the next step.
          </Text>
        </>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

export function TurfGames({ ctx }: Props) {
  const router = useRouter();
  const back = useBack();
  const { busy, pull } = usePull();
  const games = useLive((o) => {
    const today = new Date().toISOString().slice(0, 10);
    const all = allGames(o).map((g) => summarise(o, g));
    return { upcoming: all.filter((s) => s.game.data.date >= today).reverse(), past: all.filter((s) => s.game.data.date < today) };
  }, []);
  const f = ctx.format.currency;
  const row = (s: (typeof games.past)[number]) => (
    <RowItem
      key={s.game.id}
      icon="target"
      tint={TINT}
      title={s.game.title}
      subtitle={[s.game.data.time, `${s.players} players`, s.game.data.scoreA != null ? `${s.game.data.scoreA}–${s.game.data.scoreB}` : null].filter(Boolean).join(' · ')}
      value={f(s.game.data.totalCost)}
      meta={s.outstanding ? `${f(s.outstanding)} due` : 'Paid'}
      metaTone={s.outstanding ? 'alert' : 'ok'}
      chevron
      onPress={() => router.push(`/board/turf/game?game=${s.game.id}` as never)}
    />
  );
  return (
    <Screen title="Games" subtitle="Match centre and history" onBack={back} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      {!games.upcoming.length && !games.past.length ? <NotConnected /> : null}
      {games.upcoming.length ? (
        <Section title="Match centre">
          <RowList>{games.upcoming.map(row)}</RowList>
        </Section>
      ) : null}
      {games.past.length ? (
        <Section title="Match history" meta={`${games.past.length}`}>
          <RowList>{games.past.map(row)}</RowList>
        </Section>
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

export function TurfGame({ ctx, params }: Props) {
  const router = useRouter();
  const back = useBack();
  const [tab, setTab] = useState<'payments' | 'teams'>('payments');
  const d = useLive((o) => {
    const g = params.game ? o.records.get(params.game) : undefined;
    if (!g || g.object !== 'game') return null;
    const game = g as unknown as ReturnType<typeof allGames>[number];
    return { game, sum: summarise(o, game), lineup: lineup(o, game.id), venue: game.data.venueId ? o.records.get(game.data.venueId) : undefined, motm: game.data.motmId ? o.records.get(game.data.motmId)?.title : undefined, fronted: game.data.frontedById ? o.records.get(game.data.frontedById)?.title : undefined };
  }, [params.game]);
  const f = ctx.format.currency;
  if (!d) {
    return (
      <Screen title="Game" onBack={back}>
        <EmptyState icon="target" line="That game isn’t here any more." />
      </Screen>
    );
  }
  const g = d.game.data;
  const terms = PAYMENT_TERMS.find((x) => x.value === g.paymentTerms)?.label;
  const team = (t: 'A' | 'B' | undefined) => d.lineup.filter((l) => l.appearance.data.team === t);
  return (
    <Screen title={d.game.title} subtitle={[g.time, g.sideSize ? `${g.sideSize}-a-side` : null, terms].filter(Boolean).join(' · ')} onBack={back}>
      <StatTrio
        stats={[
          { label: 'Turf cost', value: f(g.totalCost) },
          { label: 'Collected', value: f(d.sum.collected), tone: 'ok' },
          { label: 'To collect', value: f(d.sum.outstanding), tone: d.sum.outstanding ? 'alert' : undefined },
        ]}
      />
      {g.scoreA != null && g.scoreB != null ? (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
            <Stat value={String(g.scoreA)} caption="Team A" size="count" />
            <Text variant="title" color="secondary">
              –
            </Text>
            <Stat value={String(g.scoreB)} caption="Team B" size="count" />
          </View>
          {d.motm ? (
            <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
              Man of the match: {d.motm}
            </Text>
          ) : null}
        </Card>
      ) : null}
      <Segmented options={[{ value: 'payments', label: 'Payment checklist' }, { value: 'teams', label: 'Team view' }]} value={tab} onChange={setTab} />
      {tab === 'payments' ? (
        <Section title={`${d.sum.paidCount} of ${d.sum.players} paid`} meta={d.fronted ? `Fronted by ${d.fronted}` : undefined}>
          <RowList>
            {d.lineup.map((l) => (
              <RowItem
                key={l.appearance.id}
                icon={l.appearance.data.paid ? 'check-circle' : 'circle'}
                iconTone={l.appearance.data.paid ? 'accent' : undefined}
                tint={TINT}
                title={l.name}
                subtitle={[l.appearance.data.attendance !== 'confirmed' ? ATTENDANCE.find((a) => a.value === l.appearance.data.attendance)?.label : null, l.appearance.data.rsvp ? `RSVP ${l.appearance.data.rsvp}` : null].filter(Boolean).join(' · ') || null}
                value={f(l.appearance.data.share)}
                meta={l.appearance.data.paid ? 'Paid' : l.appearance.data.amountPaid ? `${f(l.appearance.data.amountPaid)} paid` : 'Unpaid'}
                metaTone={l.appearance.data.paid ? 'ok' : 'alert'}
                onPress={() => router.push(`/entity/person/${l.appearance.data.personId}` as never)}
              />
            ))}
          </RowList>
        </Section>
      ) : (
        <>
          {(['A', 'B', undefined] as const).map((t) =>
            team(t).length ? (
              <Section key={t ?? 'none'} title={t ? `Team ${t}` : 'No team yet'}>
                <RowList>
                  {team(t).map((l) => (
                    <RowItem
                      key={l.appearance.id}
                      icon="user"
                      tint={TINT}
                      title={l.name}
                      subtitle={[l.appearance.data.position, l.appearance.data.inGoal ? 'in goal' : null].filter(Boolean).join(' · ') || null}
                      value={[l.appearance.data.goals ? `${l.appearance.data.goals} G` : null, l.appearance.data.assists ? `${l.appearance.data.assists} A` : null, l.appearance.data.saves ? `${l.appearance.data.saves} S` : null].filter(Boolean).join(' ') || null}
                    />
                  ))}
                </RowList>
              </Section>
            ) : null,
          )}
        </>
      )}
      {d.venue ? (
        <Section title="Venue">
          <RowList>
            <RowItem icon="location" tint={TINT} title={d.venue.title} subtitle={d.venue.subtitle} chevron onPress={() => router.push(`/entity/venue/${d.venue!.id}` as never)} />
          </RowList>
        </Section>
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

const METRICS: Array<{ value: LeaderMetric; label: string }> = [
  { value: 'goals', label: 'Goals' },
  { value: 'assists', label: 'Assists' },
  { value: 'games', label: 'Games' },
  { value: 'motm', label: 'MOTM' },
];

export function TurfPlayers({ ctx }: Props) {
  const router = useRouter();
  const back = useBack();
  const [view, setView] = useState<'squad' | 'leaders'>('squad');
  const [metric, setMetric] = useState<LeaderMetric>('goals');
  const squad = useLive((o) => allPlayers(o).map((p) => ({ p, s: statsFor(o, p.data.personId) })), []);
  const me = useLive((o) => mePersonId(o), []);
  const top = useLive((o) => leaders(o, metric, 15), [metric]);
  return (
    <Screen title="Players" subtitle={`${squad.length} in the squad`} onBack={back}>
      {!squad.length ? <NotConnected /> : null}
      <Segmented options={[{ value: 'squad', label: 'Squad' }, { value: 'leaders', label: 'Leaders' }]} value={view} onChange={setView} />
      {view === 'squad' ? (
        <RowList>
          {squad.map(({ p, s }) => (
            <RowItem
              key={p.id}
              icon="user"
              tint={TINT}
              title={p.data.personId === me ? `${p.data.name} (you)` : p.data.name}
              subtitle={[p.data.position, p.data.availability !== 'AVL' ? (p.data.availability === 'INJ' ? 'Injured' : 'Out of station') : null].filter(Boolean).join(' · ') || null}
              value={`${s.games} game${s.games === 1 ? '' : 's'}`}
              meta={s.unpaid ? `${ctx.format.currency(s.unpaid)} due` : null}
              metaTone="alert"
              chevron
              onPress={() => router.push(`/entity/player/${p.id}` as never)}
            />
          ))}
        </RowList>
      ) : (
        <>
          <Segmented options={METRICS} value={metric} onChange={setMetric} />
          <RowList>
            {top.map((s, i) => (
              <RowItem key={s.personId} icon="user" tint={TINT} title={`${i + 1}. ${s.name}`} subtitle={`${s.games} game${s.games === 1 ? '' : 's'}`} value={String(s[metric])} strong onPress={() => router.push(`/entity/person/${s.personId}` as never)} />
            ))}
          </RowList>
          {!top.length ? (
            <Text variant="caption" color="secondary">
              Nobody yet.
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

export function TurfVenues({ ctx }: Props) {
  const router = useRouter();
  const back = useBack();
  const venues = useLive((o) => allVenues(o).map((v) => ({ v, games: allGames(o).filter((g) => g.data.venueId === v.id).length })), []);
  return (
    <Screen title="Venues" onBack={back}>
      {!venues.length ? <NotConnected /> : null}
      <RowList>
        {venues.map(({ v, games }) => (
          <RowItem key={v.id} icon="location" tint={TINT} title={v.data.name} subtitle={[v.data.sideSize ? `${v.data.sideSize}-a-side` : null, v.data.defaultTime].filter(Boolean).join(' · ') || null} value={v.data.defaultCost ? ctx.format.currency(v.data.defaultCost) : null} meta={`${games} game${games === 1 ? '' : 's'}`} chevron onPress={() => router.push(`/entity/venue/${v.id}` as never)} />
        ))}
      </RowList>
    </Screen>
  );
}
