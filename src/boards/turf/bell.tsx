import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { allGames, decideTurf, fetchTurfInbox, rupees, type TurfInbox } from '@modules/games';
import { useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, NumberField, Screen, Text, useToast } from '@ui/kit';
import { sawCount } from './bell-button';
import { usePull } from './useTurfSync';
import { Face } from './teams';
import { type Props, shortDay, useBack } from './common';
import { PillButton, SectionHead, TurfCard } from './dues';

/**
 * The bell (Turf web's, W-Home header): what waits for you, as Turf web's
 * `/api/inbox` has it. "I've paid" (confirm all or part), numbers players logged,
 * profile changes and join requests, matches players suggested, and the latest
 * answers to upcoming matches. It needs Turf web to answer now; what a decision
 * changes arrives with the sync that follows it.
 */

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const ANSWER: Record<string, string> = { going: 'In', maybe: 'Maybe', not_going: 'Out', waitlisted: 'Waiting list' };
const tags = (n: { goals: number; assists: number; saves: number }) => [n.goals ? `${n.goals}G` : null, n.assists ? `${n.assists}A` : null, n.saves ? `${n.saves} saves` : null].filter(Boolean).join(' · ') || 'nothing';

/** The bell's feed, fetched now and again after each decision; the last answer is kept while it reloads. */
function useInbox() {
  const os = useOS();
  const [inbox, setInbox] = useState<TurfInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const fresh = await fetchTurfInbox(os);
      sawCount(fresh.count);
      setInbox(fresh);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }, [os]);
  useEffect(() => {
    void load();
  }, [load]);
  return { inbox, error, busy, load };
}

export function TurfBell(_: Props) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const back = useBack();
  const { pull } = usePull();
  const { inbox, error, busy, load } = useInbox();
  const [doing, setDoing] = useState<string | null>(null);
  const [part, setPart] = useState<Record<string, number | undefined>>({});

  const decide = async (key: string, run: () => Promise<void>, done: string) => {
    setDoing(key);
    try {
      await run();
      toast.show({ message: done, icon: 'check' });
      await load();
      void pull(true);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
    setDoing(null);
  };
  const openGame = (turfId: string) => {
    const g = allGames(os).find((x) => x.data.sourceKey === `turf:games:${turfId}`);
    if (g) router.push(`/board/turf/game?game=${g.id}` as never);
  };

  const row = (face: { id: string; name: string }, title: string, sub: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Face id={face.id} name={face.name} size={32} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="rowTitle" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={2}>
          {sub}
        </Text>
      </View>
    </View>
  );
  const pair = (key: string, yes: string, no: string, onYes: () => void, onNo: () => void) => (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <PillButton title={yes} icon="check" tone="lime" height={36} full busy={doing === `${key}:yes`} disabled={!!doing} onPress={onYes} />
      <PillButton title={no} icon="x" height={36} full busy={doing === `${key}:no`} disabled={!!doing} onPress={onNo} />
    </View>
  );

  const i = inbox;
  const joins = i?.submissions.filter((s) => s.isNewPlayer) ?? [];
  const profiles = i?.submissions.filter((s) => !s.isNewPlayer) ?? [];
  const replies = i?.replies ?? [];

  return (
    <Screen title="To check" subtitle="Turf" onBack={back} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void load()} />}>
      {error && !i ? (
        <TurfCard>
          <Text variant="rowTitle">Couldn’t reach Turf web</Text>
          <Text variant="caption" color="secondary">{error}</Text>
          <PillButton title="Try again" icon="refresh" onPress={() => void load()} />
        </TurfCard>
      ) : null}

      {i?.paidClaims.length ? (
        <>
          <SectionHead title="Says they paid" meta="check your UPI or cash" />
          {i.paidClaims.map((c) => (
            <TurfCard key={c.id}>
              {row({ id: c.playerId, name: c.playerName }, `${firstName(c.playerName)} paid ${rupees(c.amountCents)}`, `${shortDay(c.date)} · ${c.venue} · by ${c.method === 'upi' ? 'UPI' : c.method}`)}
              {pair(`paid:${c.id}`, 'Confirm', 'Not yet', () => void decide(`paid:${c.id}:yes`, () => decideTurf(os, 'paid', c.id, true), `${firstName(c.playerName)} · ${rupees(c.amountCents)} recorded`), () => void decide(`paid:${c.id}:no`, () => decideTurf(os, 'paid', c.id, false), 'Not yet'))}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <NumberField label="Got part of it?" value={part[c.id]} onChange={(v) => setPart((p) => ({ ...p, [c.id]: v }))} unit="₹" />
                </View>
                <PillButton title="Confirm part" height={44} disabled={!!doing || !(part[c.id] ?? 0)} busy={doing === `paid:${c.id}:part`} onPress={() => void decide(`paid:${c.id}:part`, () => decideTurf(os, 'paid', c.id, true, part[c.id]), `${firstName(c.playerName)} · ${rupees((part[c.id] ?? 0) * 100)} recorded`)} />
              </View>
            </TurfCard>
          ))}
        </>
      ) : null}

      {i?.claims.length ? (
        <>
          <SectionHead title="Numbers to check" meta="players logged these" />
          {i.claims.map((c) => (
            <TurfCard key={c.id}>
              {row({ id: c.playerId, name: c.playerName }, `${firstName(c.playerName)}: ${tags(c)}`, `${shortDay(c.date)} · ${c.venue} · on the sheet now: ${tags(c.now)}${c.note ? ` · “${c.note}”` : ''}`)}
              {pair(`stats:${c.id}`, 'Approve', 'Reject', () => void decide(`stats:${c.id}:yes`, () => decideTurf(os, 'stats', c.id, true), `${firstName(c.playerName)}’s numbers written`), () => void decide(`stats:${c.id}:no`, () => decideTurf(os, 'stats', c.id, false), 'Rejected'))}
            </TurfCard>
          ))}
        </>
      ) : null}

      {joins.length || profiles.length ? (
        <>
          <SectionHead title="Players" meta="profile changes and join requests" />
          {joins.map((s) => (
            <TurfCard key={s.id}>
              {row({ id: s.id, name: s.playerName }, `${s.playerName} wants to join`, `sent ${shortDay(s.submittedAt.slice(0, 10))}`)}
              {pair(`join:${s.id}`, 'Approve', 'Turn down', () => void decide(`join:${s.id}:yes`, () => decideTurf(os, 'join', s.id, true), `${firstName(s.playerName)} joined the squad`), () => void decide(`join:${s.id}:no`, () => decideTurf(os, 'join', s.id, false), 'Turned down'))}
            </TurfCard>
          ))}
          {profiles.map((s) => (
            <TurfCard key={s.id}>
              {row({ id: s.playerId, name: s.playerName }, `${s.playerName} changed their profile`, `sent ${shortDay(s.submittedAt.slice(0, 10))}`)}
              <PillButton title="Review" icon="chevron-right" tone="lime" height={36} onPress={() => router.push(`/board/turf/submission?sub=${s.id}` as never)} />
            </TurfCard>
          ))}
        </>
      ) : null}

      {i?.suggestions.length ? (
        <>
          <SectionHead title="Suggested matches" />
          {i.suggestions.map((s) => {
            const players = [s.playerId, ...s.backers.map((b) => b.id)];
            const book = `/board/turf/match?suggestion=${s.id}&date=${s.date}${s.time ? `&time=${s.time}` : ''}${s.venueId ? `&venueTurf=${s.venueId}` : ''}&players=${players.join(',')}`;
            return (
              <TurfCard key={s.id}>
                {row({ id: s.playerId, name: s.playerName }, `${firstName(s.playerName)}: ${shortDay(s.date)}${s.time ? ` · ${s.time}` : ''} · ${s.venue}`, [s.backers.length ? `${s.backers.length} more want it: ${s.backers.map((b) => firstName(b.name)).join(', ')}` : null, s.note ? `“${s.note}”` : null].filter(Boolean).join(' · ') || 'nobody else yet')}
                {pair(`sugg:${s.id}`, 'Book it', 'Decline', () => router.push(book as never), () => void decide(`sugg:${s.id}:no`, () => decideTurf(os, 'suggestion', s.id, false), 'Declined'))}
              </TurfCard>
            );
          })}
        </>
      ) : null}

      {i && !i.count ? (
        <TurfCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={16} color={t.c.accent.mustard} />
            <Text variant="rowTitle">All clear</Text>
          </View>
          <Text variant="caption" color="secondary">Numbers players log, “I’ve paid”, profile changes and match suggestions show up here.</Text>
        </TurfCard>
      ) : null}

      {replies.length ? (
        <>
          <SectionHead title="Latest answers" meta="upcoming matches" />
          <TurfCard>
            {replies.map((r) => (
              <Pressable key={`${r.gameId}:${r.playerId}`} accessibilityRole="link" onPress={() => openGame(r.gameId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Face id={r.playerId} name={r.playerName} size={28} />
                <Text variant="rowTitle" numberOfLines={1} style={{ flex: 1 }}>
                  {`${firstName(r.playerName)} · ${r.promoted ? 'moved up from the waiting list' : ANSWER[r.status] ?? r.status}`}
                </Text>
                <Text variant="caption" color="tertiary">{`${shortDay(r.date)} · ${r.venue}`}</Text>
              </Pressable>
            ))}
          </TurfCard>
        </>
      ) : null}
    </Screen>
  );
}
