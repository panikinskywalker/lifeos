import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { LifeEvent } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { allGames, auditLog, duesTexts, isSending, kitsOf, lineup, pickCaptains, markPaid, matchTexts, mePersonId, owedOn, recordPayment, summarise, ATTENDANCE_WORDS, PAYMENT_TERMS, SETTING_UPI, type AppearanceData, type PaymentKind } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { Button, EmptyState, FilterChip, Icon, IconButton, RowItem, RowList, Screen, Section, Sheet, Text, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';
import { MatchPlayerSheet, ScoreSheet } from './match';
import { AddPlayersSheet } from './add-players';
import { AuditRows, useUndo } from './dues';
import { SearchBox, found } from './search';
import { Crest, Display, Face, GoalBall, Mono, Pitch, SideLists, SyncPill, pitchPlayers } from './teams';
import { CopyShare, useCopyShare } from './switcher';
import { type Props, TINT, shortDay, useBack } from './common';
import { BellButton } from './bell-button';

/**
 * Turf · Noir, the match (TF-MatchTeams, TF-MatchChecklist, TF-PaySheet): the
 * hero (crests, score, scorers, player of the match), then the Payment
 * checklist — who's paid, part-paid and still to pay, each share's entries,
 * the reminders and the match's WhatsApp texts — or the Team view. A payment
 * shows here at once and is sent to Turf web straight after.
 */

const INK = '#0B0B0D';
const DIM = 'rgba(255,255,255,0.07)';
const HAIR = 'rgba(255,255,255,0.08)';
const CHARCOAL = '#26262B';
const LIME = '#D7F55C';
const CORAL = '#FF8A7A';

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
/** "Sat 9:40p", the checklist's mono stamp. */
const stamp = (ms: number) => `${format(ms, 'EEE h:mm')}${format(ms, 'a').toLowerCase()[0]}`;
const VIA: Record<string, string> = { lifeos: 'LifeOS', web: 'Turf web', import: 'Turf Ledger', sms: 'matched SMS' };

/** How an entry reads: "Part payment · Turf web". */
function entryWords(e: LifeEvent, share: number) {
  const amount = Number(e.meta.amount ?? 0);
  const kind = String(e.meta.entry ?? 'payment');
  const what = kind === 'refund' ? 'Refund' : kind === 'correction' ? 'Correction' : kind === 'opening' ? 'From Turf Ledger' : Math.abs(amount) < share ? 'Part payment' : 'Payment';
  const device = typeof e.meta.device === 'string' && e.meta.device ? e.meta.device : null;
  const where = device ?? VIA[String(e.meta.via ?? '')] ?? null;
  return { amount, line: [what, where].filter(Boolean).join(' · ') };
}

/** The match as the screen reads it, live. */
function readGame(o: LifeOSContext, gameId: string | undefined) {
  const g = gameId ? o.records.get(gameId) : undefined;
  if (!g || g.object !== 'game') return null;
  const game = g as unknown as ReturnType<typeof allGames>[number];
  return {
    game,
    sum: summarise(o, game),
    pitch: pitchPlayers(o, game.id),
    lineup: lineup(o, game.id).map((l) => ({ ...l, sending: isSending(o, l.appearance.id) })),
    venue: game.data.venueId ? o.records.get(game.data.venueId) : undefined,
    motm: game.data.motmId ? o.records.get(game.data.motmId)?.title : undefined,
    fronted: game.data.frontedById ? o.records.get(game.data.frontedById)?.title : undefined,
    me: mePersonId(o),
    upi: o.settings.get<string | null>(SETTING_UPI, null),
    texts: matchTexts(o, game.id),
    dues: duesTexts(o),
  };
}

export function TurfGame({ ctx, params }: Props) {
  const router = useRouter();
  const back = useBack();
  const [tab, setTab] = useState<'payments' | 'teams'>('payments');
  const [paying, setPaying] = useState<string | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [adding, setAdding] = useState(false);
  const os = useOS();
  const toast = useToast();
  const undo = useUndo(async (quiet) => pull(quiet));
  // This match's own history (goals, sides, captains, edits), as Turf web's Match history; money is in the audit log.
  const history = useLive((o) => {
    const g = o.records.get<{ sourceKey?: string }>(params.game ?? '');
    const turfId = g?.data.sourceKey?.replace('turf:games:', '');
    return turfId ? auditLog(o).filter((a) => a.gameId === turfId && a.kind !== 'dues') : [];
  }, [params.game]);
  const captains = () => {
    if (!d) return;
    try {
      const r = pickCaptains(os, d.game.id);
      const k = kitsOf(d.game.data);
      const name = (id?: string) => d.lineup.find((l) => l.appearance.data.personId === id)?.name.split(/\s+/)[0] ?? '?';
      toast.show({ message: [r.A ? `${k.A.name}: ${name(r.A.personId)} (${r.A.why})` : null, r.B ? `${k.B.name}: ${name(r.B.personId)} (${r.B.why})` : null].filter(Boolean).join(' · ') || 'Pick the sides first', icon: 'check' });
      void pull(true);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const theme = useTheme();
  const { pull } = usePull();
  const d = useLive((o) => readGame(o, params.game), [params.game]);
  if (!d) {
    return (
      <Screen title="Game" onBack={back}>
        <EmptyState icon="target" line="That game isn’t here any more." />
      </Screen>
    );
  }
  const g = d.game.data;
  const kits = kitsOf(g);
  const names = new Map(d.lineup.map((l) => [l.appearance.data.personId, l.name]));
  // Turf web's player ids (votes are kept by them), from each share's key.
  const turfName = new Map(d.lineup.map((l) => [l.appearance.data.sourceKey?.split(':').pop() ?? '', l.name]));
  const played = g.scoreA != null && g.scoreB != null;
  // As Turf web: a match is upcoming until 90 minutes after kick-off (India time).
  const kickOff = Date.parse(`${g.date}T${g.time && /^\d{2}:\d{2}/.test(g.time) ? g.time.slice(0, 5) : '23:59'}:00+05:30`);
  const upcoming = !played && Date.now() < kickOff + 90 * 60_000;
  // Turf web's vote window: from kick-off, the match plus 24 hours (72 for matches up to 21 Oct).
  const voteCloses = kickOff + (90 * 60 + (g.date <= '2026-10-21' ? 72 : 24) * 3600) * 1000;
  const days = Math.round((Date.parse(`${g.date}T12:00:00`) - Date.parse(`${format(new Date(), 'yyyy-MM-dd')}T12:00:00`)) / 86_400_000);
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 1 ? `in ${days} days` : format(new Date(`${g.date}T12:00:00`), 'EEE d MMM');
  const [hh = 0, mm = 0] = (g.time ?? '').split(':').map(Number);
  const clock = g.time ? `${String(hh % 12 === 0 ? 12 : hh % 12).padStart(2, '0')}:${String(mm).padStart(2, '0')}` : '--:--';
  const scorers = (side: 'A' | 'B') => d.lineup.filter((l) => l.appearance.data.team === side && (l.appearance.data.goals ?? 0) > 0).sort((a, b) => (b.appearance.data.goals ?? 0) - (a.appearance.data.goals ?? 0));
  const captainName = (side: 'A' | 'B') => {
    const id = side === 'A' ? g.captainAId : g.captainBId;
    return id ? names.get(id)?.split(/\s+/)[0] : undefined;
  };
  const motmApp = d.lineup.find((l) => l.appearance.data.personId === g.motmId)?.appearance.data;
  const motmLine = d.motm ? [d.motm, motmApp?.goals ? `${motmApp.goals} goal${motmApp.goals === 1 ? '' : 's'}` : null, motmApp?.assists ? `${motmApp.assists}A` : null, motmApp?.saves ? `${motmApp.saves} saves` : null].filter(Boolean).join(' · ') : null;
  const crestColumn = (side: 'A' | 'B') => (
    <View style={{ width: 96, alignItems: 'center', gap: 8 }}>
      <Crest kit={kits[side]} size={64} />
      <Display size={20}>{kits[side].name}</Display>
      <Text variant="caption" color="tertiary" numberOfLines={1}>
        {captainName(side) ? `C · ${captainName(side)}` : ' '}
      </Text>
    </View>
  );
  const pill = (label: string) => (
    <View key={label} style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: theme.c.bg.dim }}>
      <Text variant="labelMicro" color="secondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  return (
    <Screen
      title="Match"
      subtitle="Turf › Games"
      onBack={back}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SyncPill />
          <BellButton />
          <IconButton icon="edit" accessibilityLabel="Edit match" filled onPress={() => router.push(`/board/turf/match?game=${d.game.id}` as never)} />
        </View>
      }
    >
      {/* 4b hero (TF-MatchTeams): crests, the Bebas score, scorers, pills, player of the match. */}
      <View style={{ backgroundColor: theme.c.bg.tile, borderRadius: 28, padding: 16, gap: 14 }}>
        <View style={{ alignSelf: 'center', height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: upcoming ? theme.c.bg.dim : theme.c.accent.mustard }}>
          <Text variant="labelMicro" color={upcoming ? 'secondary' : theme.c.accent.mustardInk}>
            {upcoming ? `${g.paymentTerms === 'tentative' ? 'Tentative' : 'Kick-off'} · ${when}` : 'Full time'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {crestColumn('A')}
          <Pressable accessibilityRole="button" accessibilityLabel={played ? `Score ${g.scoreA} to ${g.scoreB}. Change score` : 'Add the score'} onPress={() => setScoring(true)} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            {upcoming ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Display size={56}>{clock}</Display>
                <Display size={20} color="#F5F5F79E">
                  {g.time ? (hh >= 12 ? 'PM' : 'AM') : ''}
                </Display>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Display size={64} color={kits.A.text}>
                  {played ? String(g.scoreA) : '–'}
                </Display>
                <Display size={40} color="#F5F5F738">
                  –
                </Display>
                <Display size={64} color={kits.B.text}>
                  {played ? String(g.scoreB) : '–'}
                </Display>
              </View>
            )}
            <Text variant="caption" color="secondary">
              {format(new Date(`${g.date}T12:00:00`), 'EEE d MMM')}
            </Text>
          </Pressable>
          {crestColumn('B')}
        </View>
        {scorers('A').length || scorers('B').length ? (
          <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 4 }}>
            {(['A', 'B'] as const).map((side) => (
              <View key={side} style={{ flex: 1, gap: 2, alignItems: side === 'A' ? 'flex-start' : 'flex-end' }}>
                {scorers(side).map((l) => (
                  <View key={l.appearance.id} style={{ flexDirection: side === 'A' ? 'row' : 'row-reverse', alignItems: 'center', gap: 6 }}>
                    <GoalBall n={l.appearance.data.goals ?? 0} size={14} id={`hero-${l.appearance.id}`} />
                    <Text variant="labelMicro" color="secondary" style={{ lineHeight: 18 }} numberOfLines={1}>
                      {`${l.name}${(l.appearance.data.goals ?? 0) > 1 ? ` ×${l.appearance.data.goals}` : ''}`}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {[d.venue?.title ?? g.venueName, g.sideSize ? `${g.sideSize}-a-side` : null, upcoming ? `${d.lineup.length} in · ${g.expectedPlayers ?? d.lineup.length}` : `${d.sum.paidCount} of ${d.sum.players} paid`, upcoming ? PAYMENT_TERMS.find((x) => x.value === g.paymentTerms)?.label : null].filter((x): x is string => !!x).map(pill)}
        </View>
        {g.potmSettled && Object.keys(g.potmVotes ?? {}).length ? (
          <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
            {(['potmVotes', 'teamVotes'] as const)
              .map((field) => {
                const n = new Map<string, number>();
                for (const nominee of Object.values(g[field] ?? {})) n.set(nominee, (n.get(nominee) ?? 0) + 1);
                const list = [...n.entries()].sort((a, b) => b[1] - a[1]).map(([id, c]) => `${firstName(turfName.get(id) ?? 'Someone')} ${c}`);
                return list.length ? `${field === 'potmVotes' ? 'Votes' : 'Best on their team'}: ${list.join(' · ')}` : null;
              })
              .filter(Boolean)
              .join('\n')}
          </Text>
        ) : null}
        {!upcoming && !g.motmId ? (
          <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
            {g.potmSettled ? 'The vote tied. Pick player of the match from the team view.' : Date.now() < voteCloses ? `Player of the match: everyone who played can vote from their page until ${format(new Date(voteCloses), 'EEE h:mm a')}.` : 'No player of the match yet.'}
          </Text>
        ) : null}
        {motmLine ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18, backgroundColor: theme.c.bg.dim }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="star" size={16} color={theme.c.accent.mustardInk} />
            </View>
            <Face id={g.motmId!} name={d.motm!} size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="caption" color="tertiary">
                Player of the match
              </Text>
              <Text variant="label" style={{ fontWeight: '700' }} numberOfLines={1}>
                {motmLine}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      {/* The two tab pills (40 tall, selected lime). */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {([['payments', 'Payment checklist'], ['teams', 'Team view']] as const).map(([key, label]) => (
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={{ flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === key ? theme.c.accent.mustard : theme.c.bg.tile }}>
            <Text variant="label" color={tab === key ? theme.c.accent.mustardInk : 'secondary'} style={{ fontSize: 13, fontWeight: '700' }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === 'payments' ? (
        <Checklist d={d} f={ctx.format.currency} onPay={setPaying} onChanged={() => void pull(true)} />
      ) : (
        <>
          <View style={{ backgroundColor: theme.c.bg.tile, borderRadius: 28, padding: 12, gap: 10 }}>
            <Pitch game={g} players={d.pitch} />
            <SideLists game={g} apps={d.lineup.map((l) => l.appearance)} names={names} onOpen={setPlayer} />
          </View>
          {d.lineup.some((l) => !l.appearance.data.team && l.appearance.data.attendance !== 'no_show') ? (
            <Text variant="caption" color="tertiary">
              {`${d.lineup.filter((l) => !l.appearance.data.team && l.appearance.data.attendance !== 'no_show').length} without a side yet`}
            </Text>
          ) : null}
          <Button title="Pick teams" icon="people" variant="secondary" block onPress={() => router.push(`/board/turf/teams?game=${d.game.id}` as never)} />
          {d.lineup.some((l) => l.appearance.data.team) ? <Button title="Suggest captains" icon="star" variant="ghost" block onPress={captains} /> : null}
        </>
      )}
      <Button title="Add players" icon="plus" variant="secondary" block onPress={() => setAdding(true)} />
      <Button title="Log stats" icon="edit" variant="secondary" block onPress={() => router.push(`/board/turf/stats?game=${d.game.id}` as never)} />
      {history.length ? (
        <Section title="Match history">
          <View style={{ padding: 14, gap: 8, borderRadius: 24, backgroundColor: theme.c.bg.tile }}>
            <AuditRows entries={history.slice(0, 20)} onUndo={(c) => void undo(c)} />
          </View>
        </Section>
      ) : null}
      {d.venue ? (
        <Section title="Venue">
          <RowList>
            <RowItem icon="location" tint={TINT} title={d.venue.title} subtitle={d.venue.subtitle} chevron onPress={() => router.push(`/entity/venue/${d.venue!.id}` as never)} />
          </RowList>
        </Section>
      ) : null}
      <PaymentSheet appearanceId={paying} onClose={() => setPaying(null)} onRecorded={() => void pull(true)} />
      <MatchPlayerSheet appearanceId={player} onClose={() => setPlayer(null)} onChanged={() => void pull(true)} />
      <ScoreSheet gameId={scoring ? d.game.id : null} onClose={() => setScoring(false)} onChanged={() => void pull(true)} />
      <AddPlayersSheet gameId={adding ? d.game.id : null} onClose={() => setAdding(false)} onChanged={() => void pull(true)} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* 4a · Payment checklist (TF-MatchChecklist)                          */
/* ------------------------------------------------------------------ */

type GameView = NonNullable<ReturnType<typeof readGame>>;

function Checklist({ d, f, onPay, onChanged }: { d: GameView; f: (n: number) => string; onPay: (appearanceId: string) => void; onChanged: () => void }) {
  const [q, setQ] = useState('');
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const g = d.game.data;
  const tentative = g.paymentTerms === 'tentative';
  const each = d.lineup[0]?.appearance.data.share ?? 0;
  const frontedWho = g.frontedById ? (g.frontedById === d.me ? 'you' : firstName(d.fronted ?? 'Someone')) : null;
  const paidOf = (a: AppearanceData) => owedOn(a) === 0;
  const settle = (appearanceId: string, name: string) => {
    const a = os.records.get<AppearanceData>(appearanceId);
    const owed = a ? owedOn(a.data) : 0;
    try {
      if (markPaid(os, appearanceId)) {
        toast.show({ message: `${firstName(name)} paid ${f(owed)} · sending to Turf web`, icon: 'check' });
        onChanged();
      }
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const ratio = d.sum.players ? d.sum.paidCount / d.sum.players : 0;
  const pending = d.lineup.filter((l) => !paidOf(l.appearance.data));
  return (
    <>
      <View style={{ padding: 14, gap: 12, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Text variant="tileTitle" style={{ fontWeight: '700', lineHeight: 20 }}>
              {`${d.sum.paidCount} of ${d.sum.players} paid`}
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={1} style={{ marginLeft: 'auto', flexShrink: 1 }}>
              {[each ? `${f(each)} each` : null, tentative ? 'dues paused' : null, frontedWho ? `${frontedWho} fronted ${f(g.totalCost)}` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: DIM, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(ratio * 100)}%`, height: '100%', borderRadius: 5, backgroundColor: LIME }} />
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: HAIR }} />
        {d.lineup.length > 8 ? <SearchBox value={q} onChange={setQ} placeholder="Find a player" /> : null}
        <View style={{ gap: 8 }}>
          {d.lineup.filter((l) => found(q, l.name)).map((l, i) => (
            <React.Fragment key={l.appearance.id}>
              {i ? <View style={{ height: 1, backgroundColor: HAIR }} /> : null}
              <PayRow
                l={l}
                f={f}
                me={d.me}
                fronted={l.appearance.data.personId === g.frontedById}
                open={open === l.appearance.id}
                reminder={d.dues.reminder(l.appearance.data.personId)}
                onToggle={() => setOpen((x) => (x === l.appearance.id ? null : l.appearance.id))}
                onSettle={() => settle(l.appearance.id, l.name)}
                onPay={() => onPay(l.appearance.id)}
              />
            </React.Fragment>
          ))}
        </View>
      </View>

      {d.texts ? (
        <View style={{ padding: 14, gap: 12, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="tileTitle">Payment summary</Text>
              <Text variant="caption" color="secondary" style={{ fontWeight: '500' }}>
                as it reads on WhatsApp
              </Text>
            </View>
            <CopyShare text={d.texts.summary} what="Payment status copied" />
          </View>
          <View style={{ borderRadius: 16, backgroundColor: DIM, paddingVertical: 12, paddingHorizontal: 14 }}>
            <Text variant="caption" color="secondary" selectable style={{ fontWeight: '500', lineHeight: 19 }}>
              {d.texts.summary.replace(/\*/g, '')}
            </Text>
          </View>
          <SummaryButtons long={d.texts.summary} short={d.texts.summaryShort} pending={pending.length && !tentative ? d.texts.pending : null} />
        </View>
      ) : null}

      {d.texts ? (
        <View style={{ padding: 14, gap: 10, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          <Text variant="tileTitle">Match texts</Text>
          {[
            { label: 'Match details', sub: 'venue, kick-off, who’s in', text: d.texts.details, what: 'Match details copied' },
            { label: 'Result', sub: 'score, scorers, player of the match', text: d.texts.result, what: 'Result copied' },
          ].map((x, i) => (
            <React.Fragment key={x.label}>
              {i ? <View style={{ height: 1, backgroundColor: HAIR }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="label" style={{ fontWeight: '700' }}>
                    {x.label}
                  </Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>
                    {x.sub}
                  </Text>
                </View>
                <CopyShare text={x.text} what={x.what} />
              </View>
            </React.Fragment>
          ))}
        </View>
      ) : null}
    </>
  );
}

/** Copy the status, long or short (as Turf web's Copy details / Copy short); share the still-to-pay nudge. */
function SummaryButtons({ long, short, pending }: { long: string; short: string; pending: string | null }) {
  const { copy, share } = useCopyShare();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button title="Copy details" icon="file" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => void copy(long, 'Payment status copied')} />
      <Button title="Copy short" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => void copy(short, 'Short status copied')} />
      <Button title="Remind unpaid" variant="ghost" size="sm" style={{ flex: 1 }} disabled={!pending} onPress={() => pending && share(pending)} />
    </View>
  );
}

/** A round control: 28 tick / ring, 30 or 36 action. */
function Round({ size, background, border, icon, iconSize, color, label, onPress }: { size: number; background?: string; border?: string; icon?: string; iconSize?: number; color?: string; label: string; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: background ?? 'transparent', borderWidth: border ? 1.5 : 0, borderColor: border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
      {icon ? <Icon name={icon} size={iconSize ?? 15} color={color ?? '#F5F5F7'} /> : null}
    </Pressable>
  );
}

function PayRow({ l, f, me, fronted, open, reminder, onToggle, onSettle, onPay }: { l: GameView['lineup'][number]; f: (n: number) => string; me: string | null; fronted: boolean; open: boolean; reminder: string | null; onToggle: () => void; onSettle: () => void; onPay: () => void }) {
  const { copy, share } = useCopyShare();
  const a = l.appearance.data;
  const owed = owedOn(a);
  const paid = a.amountPaid ?? 0;
  const partial = owed > 0 && paid > 0;
  // Credit moved in from another match, as Turf web words it ("₹28 from credit").
  const credit = useLive((o) => o.records.timeline.forEntity(l.appearance.id, 200).filter((e) => e.kind === 'payment' && (e.body ?? '').startsWith('Credit from')).reduce((sum, e) => sum + Number(e.meta.amount ?? 0), 0), [l.appearance.id]);
  const first = firstName(l.name);
  const attendance = a.attendance === 'confirmed' ? 'played' : ATTENDANCE_WORDS[a.attendance];
  const sub = [partial ? `${f(paid)} of ${f(a.share)}` : f(a.share), credit > 0 ? `${f(credit)} from credit` : null, attendance, l.sending ? 'sending…' : null].filter(Boolean).join(' · ');
  const remind = (size: number, iconSize: number) =>
    reminder ? (
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Round size={size} background={CHARCOAL} icon="file" iconSize={iconSize} label={`Copy reminder for ${first}`} onPress={() => void copy(reminder, `Reminder for ${first} copied`)} />
        <Round size={size} background={CHARCOAL} icon="send" iconSize={iconSize} label={`Share reminder for ${first}`} onPress={() => share(reminder)} />
      </View>
    ) : null;
  return (
    <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${l.name}, ${sub}`} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Face id={a.personId} name={l.name} size={36} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="rowTitle" numberOfLines={1}>
            {a.personId === me ? `${l.name} (you)` : l.name}
          </Text>
          <Text variant="caption" color={a.attendance === 'no_show' ? CORAL : 'secondary'} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {fronted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(215,245,92,0.16)' }}>
            <Icon name="check" size={13} color={LIME} />
            <Text variant="labelMicro" color={LIME}>
              Fronted
            </Text>
          </View>
        ) : owed === 0 ? (
          <Round size={28} background={LIME} icon="check" iconSize={17} color={INK} label={`${first} paid · show entries`} onPress={onToggle} />
        ) : partial ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: 'rgba(255,92,71,0.18)' }}>
              <Text variant="labelMicro" color={CORAL}>{`${f(owed)} left`}</Text>
            </View>
            <Round size={28} background={DIM} icon={open ? 'chevron-up' : 'chevron-down'} iconSize={16} label={open ? 'Hide entries' : 'Show entries'} onPress={onToggle} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {open ? null : remind(30, 13)}
            <Round size={28} border="rgba(245,245,247,0.22)" label={`Mark ${first} paid · ${f(owed)}`} onPress={onSettle} />
          </View>
        )}
      </Pressable>
      {open ? (
        <>
          <Entries appearanceId={l.appearance.id} share={a.share} f={f} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {owed > 0 ? <Button title={`Pay ${f(owed)}`} icon="check" size="sm" style={{ height: 36 }} onPress={onSettle} /> : null}
            <Round size={36} background={CHARCOAL} icon="edit" label="Record a part payment, refund or correction" onPress={onPay} />
            <View style={{ marginLeft: 'auto' }}>{owed > 0 ? remind(36, 15) : null}</View>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** A share's entries under its row: amount, kind, where, when, and the last note. */
function Entries({ appearanceId, share, f }: { appearanceId: string; share: number; f: (n: number) => string }) {
  const entries = useLive((o) => o.records.timeline.forEntity(appearanceId, 200).filter((e) => e.kind === 'payment'), [appearanceId]);
  const t = useTheme();
  if (!entries.length) {
    return (
      <Text variant="caption" color="tertiary" style={{ paddingLeft: 12 }}>
        No entries yet.
      </Text>
    );
  }
  const note = entries.find((e) => e.body)?.body;
  return (
    <View style={{ paddingVertical: 2, paddingLeft: 12 }}>
      {entries.map((e) => {
        const w = entryWords(e, share);
        return (
          <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 26 }}>
            <Text variant="label" color={w.amount < 0 ? CORAL : LIME} style={{ width: 56, fontWeight: '800' }}>
              {`${w.amount < 0 ? '–' : '+'}${f(Math.abs(w.amount))}`}
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
              {e.meta.pending ? `${w.line} · sending…` : w.line}
            </Text>
            <Mono size={9} style={{ letterSpacing: 0.5 }} color={t.c.fg.tertiary}>
              {stamp(e.occurredAt)}
            </Mono>
          </View>
        );
      })}
      {note ? (
        <Text variant="caption" color="tertiary" style={{ paddingTop: 4, paddingBottom: 2 }}>
          {`“${note}”`}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 4a′ · Record a payment (TF-PaySheet)                                */
/* ------------------------------------------------------------------ */

/**
 * One share's money: a new entry — a payment (part payments allowed, more
 * than the share is a credit), a refund or a correction — with a note, and
 * every entry so far (sending ones marked). Recorded here at once, sent to
 * Turf web straight after, kept on the phone while offline.
 */
function PaymentSheet({ appearanceId, onClose, onRecorded }: { appearanceId: string | null; onClose: () => void; onRecorded: () => void }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<PaymentKind>('payment');
  const [amount, setAmount] = useState('');
  const [less, setLess] = useState(false);
  const [note, setNote] = useState('');
  const d = useLive((o) => {
    const a = appearanceId ? o.records.get<AppearanceData>(appearanceId) : undefined;
    if (!a || a.object !== 'appearance') return null;
    const entries = o.records.timeline.forEntity(a.id, 200).filter((e) => e.kind === 'payment');
    return { a, name: o.records.get(a.data.personId)?.title ?? 'Someone', owed: owedOn(a.data), entries };
  }, [appearanceId]);
  useEffect(() => {
    setKind('payment');
    setAmount('');
    setLess(false);
    setNote('');
  }, [appearanceId]);
  if (!d) return null;
  const f = os.format.currency;
  const share = d.a.data.share;
  const paid = d.a.data.amountPaid ?? 0;
  const value = Number(amount.replace(/[^\d.]/g, '')) || 0;
  const signed = kind === 'refund' || (kind === 'correction' && less) ? -value : value;
  const record = () => {
    try {
      recordPayment(os, d.a.id, { amount: kind === 'correction' && less ? -value : value, kind, note });
      toast.show({ message: 'Recorded · sending to Turf web', icon: 'check' });
      onRecorded();
      onClose();
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const quick: Array<{ label: string; value: number }> =
    kind === 'payment'
      ? [d.owed > 0 ? { label: `${f(d.owed)} · the rest`, value: d.owed } : null, d.owed !== share && share > 0 ? { label: `${f(share)} · full`, value: share } : null].filter((x): x is { label: string; value: number } => !!x)
      : kind === 'refund' && paid > 0
        ? [{ label: `${f(paid)} · all of it`, value: paid }]
        : [];
  const hint = kind === 'payment' ? `of ${f(share)}${d.owed ? ` · ${f(d.owed)} left` : ''}` : kind === 'refund' ? `${f(paid)} paid so far` : less ? 'taken off paid' : 'added to paid';
  const field = (children: React.ReactNode, minHeight = 56) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: HAIR }}>{children}</View>;
  return (
    <Sheet
      visible={!!appearanceId}
      onClose={onClose}
      title="Record a payment"
      footer={
        <View style={{ gap: 10 }}>
          <Button title={value ? `Record ${signed < 0 ? '–' : '+'}${f(value)}` : kind === 'refund' ? 'Record refund' : kind === 'correction' ? 'Record correction' : 'Record payment'} icon="check" block disabled={!value} onPress={record} />
          <Text variant="caption" color="tertiary">
            An entry, never a tick: it shows who recorded it, where and when, and both phones’ entries.
          </Text>
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${d.name}`} onPress={() => (onClose(), router.push(`/entity/person/${d.a.data.personId}` as never))} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Face id={d.a.data.personId} name={d.name} size={40} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text variant="rowTitle" style={{ fontWeight: '700' }} numberOfLines={1}>
              {d.name}
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {[shortDay(d.a.data.gameDate), `${f(share)} share`, paid > share ? `${f(paid - share)} credit` : `${f(paid)} paid`].join(' · ')}
            </Text>
          </View>
        </Pressable>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(
            [
              ['payment', paid > 0 && d.owed > 0 ? 'Part payment' : 'Payment'],
              ['refund', 'Refund'],
              ['correction', 'Correction'],
            ] as const
          ).map(([k, label]) => (
            <FilterChip key={k} label={label} icon={kind === k ? 'rupee' : undefined} selected={kind === k} onPress={() => (setKind(k), setAmount(''))} />
          ))}
        </View>
        {kind === 'correction' ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <FilterChip label="Add to paid" selected={!less} onPress={() => setLess(false)} />
            <FilterChip label="Take off paid" selected={less} onPress={() => setLess(true)} />
          </View>
        ) : null}
        <View style={{ gap: 8 }}>
          <Text variant="tileTitle" style={{ lineHeight: 20 }}>
            Amount
          </Text>
          {field(
            <>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: DIM, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="rupee" size={14} />
              </View>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={kind === 'payment' && d.owed ? String(d.owed) : '0'} placeholderTextColor={t.c.fg.tertiary} accessibilityLabel="Amount in rupees" style={{ flex: 1, minHeight: 54, color: t.c.fg.primary, fontFamily: fonts[700], fontSize: 22 }} />
              <Text variant="labelMicro" color="tertiary">
                {hint}
              </Text>
            </>,
          )}
        </View>
        {quick.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {quick.map((q) => (
              <FilterChip key={q.label} label={q.label} selected={value === q.value} onPress={() => setAmount(String(q.value))} />
            ))}
          </View>
        ) : null}
        <View style={{ gap: 8 }}>
          <Text variant="tileTitle" style={{ lineHeight: 20 }}>
            Note
          </Text>
          {field(<TextInput value={note} onChangeText={setNote} placeholder={kind === 'refund' ? 'Didn’t play' : 'Cash at the turf'} placeholderTextColor={t.c.fg.tertiary} accessibilityLabel="Note" style={{ flex: 1, minHeight: 54, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 15 }} />)}
        </View>
        {d.entries.length ? (
          <View style={{ gap: 2 }}>
            <Mono size={9} style={{ letterSpacing: 0.5 }}>
              Entries so far
            </Mono>
            {d.entries.map((e) => {
              const w = entryWords(e, share);
              return (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 }}>
                  <Text variant="caption" color={w.amount < 0 ? CORAL : LIME} style={{ width: 60, fontWeight: '800' }}>
                    {`${w.amount < 0 ? '–' : '+'}${f(Math.abs(w.amount))}`}
                  </Text>
                  <Text variant="caption" color="tertiary" numberOfLines={1} style={{ flex: 1 }}>
                    {[w.line, format(e.occurredAt, 'EEE h:mm a').replace('AM', 'am').replace('PM', 'pm'), e.meta.pending ? 'sending…' : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
