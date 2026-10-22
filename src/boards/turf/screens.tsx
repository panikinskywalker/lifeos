import { useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { runSource } from '@core/filing/sources';
import { sourceState } from '@core/sources/deviceData';
import { allGames, allPlayers, allVenues, currentGame, isSending, markPaid, mePersonId, turfBase, leaders, lineup, moneyAtAGlance, owedOn, recordPayment, statsFor, summarise, turfChanges, whoOwes, ATTENDANCE, PAYMENT_TERMS, type AppearanceData, type LeaderMetric, type PaymentKind } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { Button, Card, EmptyState, NumberField, RowItem, RowList, Screen, Section, Segmented, Sheet, Stat, StatTrio, Text, TextField, useToast } from '@ui/kit';

/**
 * The Turf board (docs/MODEL.md layer 3; R9a, R9c): Turf Ledger's flow,
 * synced from Turf web; payments are recorded here and sent (R9c.2) — Home (money at a glance, who still owes, this week's game), Games
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
          <TurfChanges />
          <Section title="On this board">
            <RowList>
              <RowItem icon="calendar" tint={TINT} title="Games" subtitle="Match centre and history" chevron onPress={() => router.push('/board/turf/games' as never)} />
              <RowItem icon="people" tint={TINT} title="Players" subtitle={`Squad of ${data.players} · leaders`} chevron onPress={() => router.push('/board/turf/players' as never)} />
              <RowItem icon="location" tint={TINT} title="Venues" chevron onPress={() => router.push('/board/turf/venues' as never)} />
              <RowItem icon="settings" tint={TINT} title="Turf web settings" subtitle="Address, key, which player is you" chevron onPress={() => router.push('/settings/turf' as never)} />
            </RowList>
          </Section>
          <Text variant="caption" color="tertiary">
            Syncs with Turf web every minute while open; pull down to sync now. Payments you record here are sent to Turf web, and wait on this phone while you’re offline.
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
  const [paying, setPaying] = useState<string | null>(null);
  const { pull } = usePull();
  const d = useLive((o) => {
    const g = params.game ? o.records.get(params.game) : undefined;
    if (!g || g.object !== 'game') return null;
    const game = g as unknown as ReturnType<typeof allGames>[number];
    return { game, sum: summarise(o, game), lineup: lineup(o, game.id).map((l) => ({ ...l, sending: isSending(o, l.appearance.id) })), venue: game.data.venueId ? o.records.get(game.data.venueId) : undefined, motm: game.data.motmId ? o.records.get(game.data.motmId)?.title : undefined, fronted: game.data.frontedById ? o.records.get(game.data.frontedById)?.title : undefined };
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
                meta={l.sending ? 'Sending…' : owedOn(l.appearance.data) === 0 ? 'Paid' : l.appearance.data.amountPaid ? `${f(l.appearance.data.amountPaid)} paid` : 'Unpaid'}
                metaTone={l.sending ? undefined : owedOn(l.appearance.data) === 0 ? 'ok' : 'alert'}
                onPress={() => setPaying(l.appearance.id)}
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
      <PaymentSheet appearanceId={paying} onClose={() => setPaying(null)} onRecorded={() => void pull(true)} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

const KINDS: Array<{ value: PaymentKind; label: string }> = [
  { value: 'payment', label: 'Payment' },
  { value: 'refund', label: 'Refund' },
  { value: 'correction', label: 'Correction' },
];

/**
 * One share's money: paid so far, what's owed, every entry (sending ones
 * marked), and a new entry — a payment (part payments allowed, more than the
 * share is a credit), a refund or a correction. Recorded here at once, sent
 * to Turf web straight after, kept on the phone while offline.
 */
function PaymentSheet({ appearanceId, onClose, onRecorded }: { appearanceId: string | null; onClose: () => void; onRecorded: () => void }) {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<PaymentKind>('payment');
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [less, setLess] = useState<'more' | 'less'>('more');
  const [note, setNote] = useState('');
  const d = useLive((o) => {
    const a = appearanceId ? o.records.get<AppearanceData>(appearanceId) : undefined;
    if (!a || a.object !== 'appearance') return null;
    const entries = o.records.timeline.forEntity(a.id, 200).filter((e) => e.kind === 'payment');
    return { a, name: o.records.get(a.data.personId)?.title ?? 'Someone', owed: owedOn(a.data), entries, sending: isSending(o, a.id) };
  }, [appearanceId]);
  useEffect(() => {
    setKind('payment');
    setAmount(undefined);
    setLess('more');
    setNote('');
  }, [appearanceId]);
  if (!d) return null;
  const f = os.format.currency;
  const paid = d.a.data.amountPaid ?? 0;
  const done = (message: string) => {
    toast.show({ message, icon: 'check' });
    onRecorded();
    onClose();
  };
  const record = () => {
    try {
      const value = kind === 'correction' && less === 'less' ? -(amount ?? 0) : amount ?? 0;
      recordPayment(os, d.a.id, { amount: value, kind, note });
      done('Recorded · sending to Turf web');
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const settle = () => {
    if (markPaid(os, d.a.id)) done(`Marked paid · ${f(d.owed)} sending to Turf web`);
  };
  return (
    <Sheet
      visible={!!appearanceId}
      onClose={onClose}
      title={`${d.name} · ${f(d.a.data.share)}`}
      footer={<Button title={kind === 'payment' ? 'Record payment' : kind === 'refund' ? 'Record refund' : 'Record correction'} icon="check" block disabled={!amount} onPress={record} />}
    >
      <View style={{ gap: 14 }}>
        <StatTrio
          stats={[
            { label: 'Share', value: f(d.a.data.share) },
            { label: 'Paid so far', value: f(paid), tone: paid ? 'ok' : undefined },
            { label: paid > d.a.data.share ? 'Credit' : 'Still owed', value: f(paid > d.a.data.share ? paid - d.a.data.share : d.owed), tone: d.owed ? 'alert' : undefined },
          ]}
        />
        {d.owed > 0 ? <Button title={`Mark paid · ${f(d.owed)}`} icon="cash" variant="secondary" onPress={settle} /> : null}
        <Segmented options={KINDS} value={kind} onChange={setKind} />
        {kind === 'correction' ? <Segmented options={[{ value: 'more', label: 'Add to paid' }, { value: 'less', label: 'Take off paid' }]} value={less} onChange={setLess} /> : null}
        <NumberField label="Amount ₹" value={amount} onChange={setAmount} placeholder={kind === 'payment' && d.owed ? String(d.owed) : '0'} />
        <TextField label="Note" value={note} onChange={setNote} placeholder={kind === 'refund' ? 'Didn’t play' : 'Optional'} />
        {d.entries.length ? (
          <Section title="Entries">
            <RowList>
              {d.entries.map((e) => (
                <RowItem
                  key={e.id}
                  icon={e.meta.pending ? 'refresh' : 'cash'}
                  tint={TINT}
                  title={e.title}
                  subtitle={[formatDistanceToNow(e.occurredAt, { addSuffix: true }), e.meta.via === 'lifeos' ? 'LifeOS' : e.meta.via === 'web' ? 'Turf web' : e.meta.via === 'import' ? 'Turf Ledger' : e.meta.via === 'sms' ? 'matched SMS' : null, e.body].filter(Boolean).join(' · ')}
                  meta={e.meta.pending ? 'Sending…' : undefined}
                />
              ))}
            </RowList>
          </Section>
        ) : null}
        <Button title={`Open ${d.name}`} icon="user" variant="ghost" size="sm" onPress={() => { onClose(); router.push(`/entity/person/${d.a.data.personId}` as never); }} />
      </View>
    </Sheet>
  );
}

/** What waits for Turf web and what it refused, on Home; nothing when all is sent. */
function TurfChanges() {
  const os = useOS();
  const c = useLive((o) => ({ ...turfChanges(o), connected: !!turfBase(o) }), []);
  if (!c.sending.length && !c.refused.length) return null;
  return (
    <>
      {c.sending.length ? (
        <Section title="Sending" meta={!c.connected ? 'Turf web isn’t connected' : c.sending[0]!.error ? 'Waiting to connect' : undefined}>
          <RowList>
            {c.sending.map((i) => (
              <RowItem key={i.id} icon="refresh" tint={TINT} title={i.label} subtitle={i.error ?? (c.connected ? 'On its way to Turf web' : 'Waits here until you connect Turf web')} />
            ))}
          </RowList>
        </Section>
      ) : null}
      {c.refused.length ? (
        <Section title="Not sent" meta="Turf web said no">
          <RowList>
            {c.refused.map((i) => (
              <RowItem key={i.id} icon="warning" tint={TINT} title={i.label} subtitle={i.error} meta="Dismiss" metaTone="alert" onPress={() => os.outbox.dismiss(i.id)} />
            ))}
          </RowList>
        </Section>
      ) : null}
    </>
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
