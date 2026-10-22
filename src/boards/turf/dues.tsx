import React, { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { format, formatDistanceToNow } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { allAppearances, allPlayers, auditLog, duesTexts, isSending, markPaid, owedOn, recordPayment, rupees, turfDues, youPersonId, type AuditEntry, type DueGame, type DuePerson, type Dues } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { monoFonts } from '@ui/theme/tokens';
import { ChipRow, FilterChip, Icon, IconButton, Screen, Text, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Face, Mono, SyncPill } from './teams';
import { useCopyShare } from './switcher';
import { NotConnected, type Props, useBack } from './common';

/**
 * Turf · Noir money screens: 1b Dues (TF-Dues) and 1c Audit log (TF-Audit),
 * and the pieces Home and the Submission share with them — the header's sync
 * pill and ⋯, the 17/600 section head, the number tile, pill buttons and
 * discs, and the "who still owes" rows (TF-Pieces · Debts told apart). Money
 * is Turf web's own computeDues over the records here (turfDues).
 */

const INK = '#0B0B0D';
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const at = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
/** "3 Oct". */
export const dayMonth = (iso: string) => format(at(iso), 'd MMM');
/** "Sat 3 Oct". */
export const day = (iso: string) => format(at(iso), 'EEE d MMM');
export const todayIso = () => format(new Date(), 'yyyy-MM-dd');

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

/** The top bar's right side on Turf screens: "Synced 9:40" and a round ⋯ (Turf web settings). */
export function HeaderRight() {
  const router = useRouter();
  return (
    <>
      <SyncPill />
      <IconButton icon="more" filled accessibilityLabel="Turf web settings" onPress={() => router.push('/settings/turf' as never)} />
    </>
  );
}

/** Section head (padding 6 4 0): 17/600 title; a 13/600 grey note or a lime "See all ›". */
export function SectionHead({ title, meta, action, onAction }: { title: string; meta?: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <Text variant="heading" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </Text>
      {meta ? (
        <Text variant="caption" color="secondary" style={{ fontWeight: '600' }}>
          {meta}
        </Text>
      ) : null}
      {action ? (
        <Pressable accessibilityRole="link" onPress={onAction} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text variant="caption" color={t.c.accent.gold} style={{ fontWeight: '700' }}>
            {action}
          </Text>
          <Icon name="chevron-right" size={14} color={t.c.accent.gold} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A number tile (p14, r22): 11/600 caps label with a chevron, 26/700 value, 13/400 line. */
export function StatTile({ label, value, sub, accent, onPress }: { label: string; value: string; sub?: string | null; accent?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ''}`} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 96, padding: 14, gap: 8, borderRadius: 22, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Text variant="labelCaps" color="tertiary" numberOfLines={1} style={{ flex: 1, textTransform: 'uppercase' }}>
          {label}
        </Text>
        {onPress ? <Icon name="chevron-right" size={16} color={t.c.fg.tertiary} /> : null}
      </View>
      <Text variant="stat" color={accent ? t.c.accent.gold : 'primary'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 26, lineHeight: 30, letterSpacing: -0.6 }}>
        {value}
      </Text>
      {sub ? (
        <Text variant="caption" color="tertiary" numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

export type PillTone = 'lime' | 'raised' | 'dark';

/** A pill button (15/700): lime with ground ink, raised charcoal, or ground-black on a colour block. */
export function PillButton({ title, icon, onPress, tone = 'raised', height = 40, full, disabled, busy, bg, fg, style }: { title: string; icon?: string; onPress?: () => void; tone?: PillTone; height?: number; full?: boolean; disabled?: boolean; busy?: boolean; bg?: string; fg?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const back = bg ?? (tone === 'lime' ? t.c.accent.mustard : tone === 'dark' ? INK : t.c.bg.tileRaised);
  const ink = fg ?? (tone === 'lime' ? t.c.accent.mustardInk : tone === 'dark' ? '#F5F5F7' : t.c.fg.primary);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled, busy: !!busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [{ height, paddingHorizontal: 22, borderRadius: 999, backgroundColor: back, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: full ? 'stretch' : 'flex-start', opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, full ? { flex: 1 } : null, style]}>
      {busy ? <ActivityIndicator size="small" color={ink} /> : icon ? <Icon name={icon} size={18} color={ink} /> : null}
      <Text variant="body" color={ink} numberOfLines={1} style={{ fontWeight: '700', lineHeight: 20 }}>
        {title}
      </Text>
    </Pressable>
  );
}

/** A round icon button of any size and fill. */
export function Disc({ icon, label, onPress, size = 40, bg, color, iconSize }: { icon: string; label: string; onPress?: () => void; size?: number; bg?: string; color?: string; iconSize?: number }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={Math.max(0, (48 - size) / 2)} style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: bg ?? t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
      <Icon name={icon} size={iconSize ?? (size >= 40 ? 18 : 16)} color={color ?? t.c.fg.primary} />
    </Pressable>
  );
}

/** Noir tick at any size: an outline circle at 22 %; ticked lime with a ground check. */
export function Tick({ on, size = 26, onPress, label, busy }: { on: boolean; size?: number; onPress?: () => void; label: string; busy?: boolean }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: on, disabled: !onPress }} disabled={!onPress || busy} hitSlop={12} onPress={onPress} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: on ? 0 : 1.5, borderColor: '#F5F5F738', backgroundColor: on ? t.c.accent.mustard : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: !onPress && !on ? 0.5 : 1 }}>
      {busy ? <ActivityIndicator size="small" color={t.c.fg.secondary} /> : on ? <Icon name="check" size={Math.round(size * 0.6)} strokeWidth={3} color={INK} /> : null}
    </Pressable>
  );
}

/** A charcoal card (r24, p14). */
export function TurfCard({ children, gap = 10, padding = 14, radius = 24, style }: { children: React.ReactNode; gap?: number; padding?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ padding, gap, borderRadius: radius, backgroundColor: t.c.bg.tile }, style]}>{children}</View>;
}

const Hairline = () => {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
};

/* ------------------------------------------------------------------ */
/* Who still owes                                                      */
/* ------------------------------------------------------------------ */

/** The shares a due stands for: the debtor's appearances in its games (yours, for "you owe"). */
function sharesOf(os: LifeOSContext, p: DuePerson, gameIds?: string[]) {
  const debtor = p.direction === 'you_owe' ? youPersonId(os) : p.playerId;
  const ids = new Set(gameIds ?? p.games.map((g) => g.gameId));
  return allAppearances(os).filter((a) => ids.has(a.data.gameId) && a.data.personId === debtor);
}

/** A share ticked here this visit: kept in its row (dimmed, "sending" while it waits for Turf web). */
interface JustPaid {
  key: string;
  person: DuePerson;
  game: DueGame;
  appearanceId: string;
  at: number;
}

const keyOf = (p: Pick<DuePerson, 'playerId' | 'direction'>) => `${p.direction}:${p.playerId}`;

/**
 * "Who still owes": one line per person (face, name, "2 games · since 3 Oct",
 * amount, tick); tap to open their games, each with its own tick, and Settle
 * up · copy · share. The main tick marks every game paid (with Undo). A share
 * ticked here stays, dimmed, sending until Turf web has it; someone who
 * settled lately stays at the end, dimmed.
 */
export function DueRows({ people, settled = [], pull }: { people: DuePerson[]; settled?: Dues['settled']; /** The screen's Turf web sync, run after a change. */ pull: (quiet?: boolean) => Promise<void> }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const router = useRouter();
  const { copy, share } = useCopyShare();
  const [open, setOpen] = useState<string | null>(null);
  const [paid, setPaid] = useState<JustPaid[]>([]);
  const live = useLive((o) => ({ you: youPersonId(o), sending: new Set(paid.filter((x) => isSending(o, x.appearanceId)).map((x) => x.appearanceId)), reminders: duesTexts(o) }), [paid]);

  const settle = (p: DuePerson, gameIds?: string[]) => {
    const apps = sharesOf(os, p, gameIds).filter((a) => owedOn(a.data) > 0);
    if (!apps.length) return;
    const owed = new Map(apps.map((a) => [a.id, owedOn(a.data)]));
    try {
      for (const a of apps) markPaid(os, a.id);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
      return;
    }
    const now = Date.now();
    const ticked = apps.map((a): JustPaid => ({ key: keyOf(p), person: p, game: p.games.find((g) => g.gameId === a.data.gameId)!, appearanceId: a.id, at: now })).filter((x) => x.game);
    setPaid((prev) => [...prev.filter((x) => !owed.has(x.appearanceId)), ...ticked]);
    const total = [...owed.values()].reduce((s, v) => s + v, 0);
    const what = gameIds?.length === 1 && p.games.length > 1 ? `Ticked ${firstName(p.name)} · ${day(ticked[0]?.game.date ?? '')}` : `${firstName(p.name)} marked paid · ${os.format.currency(total)}`;
    toast.show({
      message: what,
      icon: 'check',
      undo: () => {
        for (const [id, amount] of owed) recordPayment(os, id, { amount: -amount, kind: 'correction', note: 'Mark paid undone' });
        setPaid((prev) => prev.filter((x) => !owed.has(x.appearanceId)));
        void pull(true);
      },
    });
    void pull(true);
  };

  // Everyone in the list, plus anyone whose shares were all ticked here.
  const keys = new Set(people.map(keyOf));
  const rows: Array<{ key: string; person: DuePerson; open: DueGame[]; ticked: JustPaid[] }> = people.map((p) => ({ key: keyOf(p), person: p, open: p.games, ticked: paid.filter((x) => x.key === keyOf(p)) }));
  for (const x of paid) {
    if (keys.has(x.key)) continue;
    keys.add(x.key);
    rows.push({ key: x.key, person: x.person, open: [], ticked: paid.filter((y) => y.key === x.key) });
  }
  const shownSettled = settled.filter((s) => !keys.has(`owes_you:${s.playerId}`) && !keys.has(`you_owe:${s.playerId}`) && !keys.has(`owes_other:${s.playerId}`));

  if (!rows.length && !shownSettled.length) return null;
  const items: React.ReactNode[] = [];
  for (const r of rows) {
    const p = r.person;
    const isOpen = open === r.key;
    const youOwe = p.direction === 'you_owe';
    const done = !r.open.length;
    const total = r.open.reduce((s, g) => s + g.balanceCents, 0);
    const doneTotal = r.ticked.reduce((s, x) => s + x.game.balanceCents, 0);
    const sendingAll = r.ticked.some((x) => live.sending.has(x.appearanceId));
    const reminder = !youOwe && !done ? live.reminders.reminder(p.playerId) : null;
    const games = [...r.ticked.map((x) => ({ g: x.game, ticked: true, sending: live.sending.has(x.appearanceId) })), ...r.open.map((g) => ({ g, ticked: false, sending: false }))].sort((a, b) => a.g.date.localeCompare(b.g.date));
    items.push(
      <View key={r.key} style={{ gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={`${p.name}, ${rupees(done ? doneTotal : total)}`} onPress={() => setOpen(isOpen ? null : r.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
          <Face id={p.playerId} name={p.name} size={36} />
          <View style={{ flex: 1, minWidth: 0, gap: 1, opacity: done ? 0.55 : 1 }}>
            <Text variant="tileTitle" numberOfLines={1} style={{ lineHeight: 20 }}>
              {p.name}
              {p.playerId === live.you ? ' (you)' : ''}
              {p.direction === 'owes_other' && p.creditorName ? <Text variant="caption" color="tertiary">{` · to ${firstName(p.creditorName)}`}</Text> : null}
            </Text>
            <Text variant="caption" color={done ? t.c.accent.gold : 'tertiary'} numberOfLines={1}>
              {done ? `${sendingAll ? 'sending' : 'paid'} · ${plural(r.ticked.length, 'game')} · ${formatDistanceToNow(r.ticked[0]!.at, { addSuffix: true }).replace('less than a minute ago', 'just now')}` : `${plural(r.open.length, 'game')} · since ${dayMonth(p.since)}`}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 1 }}>
            <Text variant="tileTitle" color={done ? 'tertiary' : youOwe ? t.c.alert.coralText : t.c.accent.gold} style={{ fontSize: 16, lineHeight: 20, fontWeight: '800' }}>
              {rupees(done ? doneTotal : total)}
            </Text>
            {youOwe && !done ? (
              <Text variant="labelCaps" color="tertiary" style={{ textTransform: 'uppercase' }}>
                You owe
              </Text>
            ) : null}
            {!done && r.ticked.some((x) => live.sending.has(x.appearanceId)) ? <SendingNote caps /> : null}
          </View>
          <Tick on={done} label={youOwe ? `You owe ${p.name}` : done ? `${p.name} paid` : `Mark every game of ${p.name} paid`} onPress={youOwe || done ? undefined : () => settle(p)} />
        </Pressable>
        {isOpen ? (
          <>
            <View style={{ marginLeft: 48, paddingVertical: 2, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: t.c.line }}>
              {games.map(({ g, ticked, sending }) => (
                <View key={g.gameId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
                  <Tick on={ticked} size={24} label={ticked ? `${day(g.date)} paid` : `Mark ${day(g.date)} paid`} onPress={youOwe || ticked ? undefined : () => settle(p, [g.gameId])} />
                  <Pressable accessibilityRole="link" onPress={() => router.push(`/board/turf/game?game=${g.gameId}` as never)} style={{ flex: 1, minWidth: 0, opacity: ticked ? 0.5 : 1 }}>
                    <Text variant="label" numberOfLines={1}>
                      {day(g.date)} · {g.venue}
                    </Text>
                    {g.paidCents > 0 && !ticked ? (
                      <Text variant="caption" color="tertiary" numberOfLines={1}>
                        {rupees(g.shareCents)} share · {rupees(g.paidCents)} paid
                      </Text>
                    ) : null}
                  </Pressable>
                  {sending ? (
                    <SendingNote />
                  ) : (
                    <Text variant="label" color={ticked ? 'tertiary' : 'primary'} style={{ fontWeight: '700' }}>
                      {rupees(g.balanceCents)}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            {!youOwe && !done ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                <PillButton title="Settle up" height={36} onPress={() => settle(p)} />
                {reminder ? (
                  <>
                    <Disc icon="file" label={`Copy a reminder for ${firstName(p.name)}`} size={36} onPress={() => void copy(reminder, `Copied · reminder for ${firstName(p.name)}`)} />
                    <Disc icon="share" label={`Share a reminder for ${firstName(p.name)}`} size={36} onPress={() => share(reminder)} />
                  </>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}
      </View>,
    );
  }
  for (const s of shownSettled) {
    items.push(
      <View key={`settled:${s.playerId}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <Face id={s.playerId} name={s.name} size={36} />
        <View style={{ flex: 1, minWidth: 0, gap: 1, opacity: 0.55 }}>
          <Text variant="tileTitle" numberOfLines={1} style={{ lineHeight: 20 }}>
            {s.name}
          </Text>
          <Text variant="caption" color={t.c.accent.gold} numberOfLines={1}>
            paid · {formatDistanceToNow(new Date(s.lastPaidAt.length <= 10 ? `${s.lastPaidAt}T12:00:00` : s.lastPaidAt), { addSuffix: true })}
          </Text>
        </View>
        <Tick on label={`${s.name} paid`} />
      </View>,
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {items.map((row, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <Hairline /> : null}
          {row}
        </React.Fragment>
      ))}
    </View>
  );
}

/** A spinner-ish refresh mark and "sending" (grey). */
function SendingNote({ caps }: { caps?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: caps ? 5 : 6 }}>
      <Icon name="refresh" size={caps ? 11 : 13} color={t.c.fg.tertiary} />
      <Text variant={caps ? 'labelCaps' : 'labelMicro'} color="tertiary" style={caps ? { textTransform: 'uppercase' } : null}>
        sending
      </Text>
    </View>
  );
}

/** Copy all · ₹1,170 and a share disc, under the rows. */
export function CopyAllRow({ height = 48 }: { height?: number }) {
  const { copy, share } = useCopyShare();
  const d = useLive((o) => ({ texts: duesTexts(o), total: turfDues(o).owedToYou.totalCents }), []);
  if (!d.total) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <PillButton title={`Copy all · ${rupees(d.total)}`} icon="file" height={height} full onPress={() => void copy(d.texts.all, 'Copied · everyone’s dues')} />
      <Disc icon="share" label="Share everyone’s dues" size={height} onPress={() => share(d.texts.all)} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 1b · Dues                                                           */
/* ------------------------------------------------------------------ */

type DuesFilter = 'all' | 'owes_you' | 'you_owe' | 'settled';
const DUES_FILTERS: Array<{ key: DuesFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'owes_you', label: 'Owes you' },
  { key: 'you_owe', label: 'You owe' },
  { key: 'settled', label: 'Settled' },
];

export function TurfDues(_props: Props) {
  const t = useTheme();
  const router = useRouter();
  const back = useBack();
  const { busy, pull } = usePull();
  const [filter, setFilter] = useState<DuesFilter>('all');
  const data = useLive((o) => {
    if (!allPlayers(o).length) return null;
    const today = todayIso();
    const changes = auditLog(o).filter((a) => a.at && format(new Date(a.at), 'yyyy-MM-dd') === today);
    return { d: turfDues(o), you: youPersonId(o), changes };
  }, []);

  let body: React.ReactNode;
  if (!data) body = <NotConnected />;
  else {
    const { d } = data;
    const youOwe = d.people.filter((p) => p.direction === 'you_owe');
    const shown = filter === 'settled' ? [] : filter === 'all' ? d.people : d.people.filter((p) => p.direction === filter);
    const oldestFirst = [...shown].sort((a, b) => a.since.localeCompare(b.since) || b.totalCents - a.totalCents);
    const settled = filter === 'all' || filter === 'settled' ? d.settled : [];
    const empty = filter === 'you_owe' ? 'You don’t owe anyone.' : filter === 'settled' ? 'Nobody has settled in the last 30 days.' : 'Nothing open. Every share is paid.';
    body = (
      <>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatTile label="Owed to you" value={rupees(d.owedToYou.totalCents)} sub={d.owedToYou.people ? `${plural(d.owedToYou.people, 'person', 'people')} · oldest ${dayMonth(d.owedToYou.oldest!)}` : 'all paid'} accent onPress={() => setFilter('owes_you')} />
          <StatTile label="You owe" value={rupees(d.youOwe.totalCents)} sub={youOwe.length ? youOwe.map((p) => `${firstName(p.name)} · ${day(p.since)}`).join(', ') : data.you ? 'nothing' : 'set which player is you'} onPress={() => (data.you ? setFilter('you_owe') : router.push('/settings/turf' as never))} />
        </View>
        <TurfCard padding={10} radius={20}>
          <Pressable accessibilityRole="link" onPress={() => router.push('/board/turf/audit' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 40 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.dim, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="history" size={16} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="rowTitle">Audit log</Text>
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {data.changes.length ? `${plural(data.changes.length, 'change')} today · last ${format(new Date(data.changes[0]!.at), 'H:mm')}` : 'Every change Turf web logged'}
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
          </Pressable>
        </TurfCard>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {DUES_FILTERS.map((f) => (
            <FilterChip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </View>
        <Text variant="caption" color="tertiary">
          Oldest first · the checkbox marks every game paid · tap a row for one game at a time
        </Text>
        <TurfCard gap={8}>
          {oldestFirst.length || settled.length ? (
            <DueRows people={oldestFirst} settled={settled} pull={pull} />
          ) : (
            <Text variant="caption" color="secondary">
              {empty}
            </Text>
          )}
        </TurfCard>
        {d.credits.length && filter === 'all' ? (
          <TurfCard gap={8}>
            <Text variant="labelCaps" color="tertiary" style={{ textTransform: 'uppercase' }}>
              Credit held
            </Text>
            {d.credits.map((c) => (
              <View key={c.playerId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text variant="rowTitle" numberOfLines={1} style={{ flex: 1 }}>
                  {c.name}
                </Text>
                <Text variant="rowTitle" color="#A9C4FF" style={{ fontWeight: '700' }}>
                  +{rupees(c.creditCents)}
                </Text>
              </View>
            ))}
            <Text variant="caption" color="tertiary">
              Paid more than their share. Turf web takes it off their next match.
            </Text>
          </TurfCard>
        ) : null}
        <CopyAllRow />
      </>
    );
  }
  return (
    <Screen title="Dues" subtitle="Turf · Home" onBack={back} right={<HeaderRight />} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      {body}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* 1c · Audit log                                                      */
/* ------------------------------------------------------------------ */

type AuditFilter = 'all' | AuditEntry['kind'];
const AUDIT_FILTERS: Array<{ key: AuditFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'dues', label: 'Dues' },
  { key: 'teams', label: 'Teams' },
  { key: 'stats', label: 'Stats' },
  { key: 'match', label: 'Matches' },
];
const KIND_WORD: Record<AuditEntry['kind'], string> = { dues: 'Dues', teams: 'Teams', stats: 'Stats', match: 'Match' };

function AuditRows({ entries }: { entries: AuditEntry[] }) {
  const t = useTheme();
  return (
    <>
      {entries.map((c, i) => {
        const when = c.at ? new Date(c.at) : null;
        const detail = [KIND_WORD[c.kind] ?? 'Match', c.device, c.actor && !c.actor.startsWith('phone:') ? c.actor : null].filter(Boolean).join(' · ');
        return (
          <View key={c.id} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: 38, paddingTop: 12 }}>
              <Mono color="tertiary" style={{ fontFamily: monoFonts[700] }}>
                {when ? format(when, 'H:mm') : ''}
              </Mono>
            </View>
            <View style={{ flex: 1, minWidth: 0, borderLeftWidth: 1.5, borderLeftColor: t.c.line, paddingTop: 8, paddingBottom: i === entries.length - 1 ? 4 : 14, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ position: 'absolute', left: -5, top: 16, width: 8, height: 8, borderRadius: 4, backgroundColor: c.undone ? '#F5F5F738' : t.c.accent.mustard }} />
              <View style={{ flex: 1, minWidth: 0, opacity: c.undone ? 0.5 : 1 }}>
                <Text variant="label" numberOfLines={2} style={c.undone ? { textDecorationLine: 'line-through' } : null}>
                  {c.summary || 'A change'}
                </Text>
                {detail ? (
                  <Text variant="caption" color="tertiary" numberOfLines={1}>
                    {detail}
                  </Text>
                ) : null}
              </View>
              {c.undone ? (
                <Text variant="labelCaps" color="tertiary" style={{ textTransform: 'uppercase' }}>
                  Undone
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </>
  );
}

export function TurfAudit(_props: Props) {
  const back = useBack();
  const { busy, pull } = usePull();
  const [filter, setFilter] = useState<AuditFilter>('all');
  const entries = useLive((o) => auditLog(o, filter === 'all' ? undefined : filter), [filter]);
  const today = todayIso();
  const yesterday = format(new Date(Date.now() - 86_400_000), 'yyyy-MM-dd');
  const byDay = new Map<string, AuditEntry[]>();
  for (const e of entries) {
    const d = e.at ? format(new Date(e.at), 'yyyy-MM-dd') : '';
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }
  return (
    <Screen title="Audit log" subtitle="Turf · Dues" onBack={back} right={<HeaderRight />} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      <ChipRow>
        {AUDIT_FILTERS.map((f) => (
          <FilterChip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ChipRow>
      <Text variant="caption" color="tertiary">
        What Turf web logged, newest first. Undo stays on Turf web for now: a change undone there shows here struck through.
      </Text>
      {byDay.size ? (
        [...byDay.entries()].map(([d, items]) => (
          <TurfCard key={d || 'undated'} gap={8}>
            <Text variant="labelCaps" color="tertiary" style={{ textTransform: 'uppercase' }}>
              {d === today ? 'Today' : d === yesterday ? 'Yesterday' : d ? day(d) : 'Undated'}
            </Text>
            <AuditRows entries={items} />
          </TurfCard>
        ))
      ) : (
        <TurfCard>
          <Text variant="caption" color="secondary">
            {filter === 'all' ? 'No changes yet. Payments, stats, teams and matches changed in Turf web or here show up after the next sync.' : `No ${AUDIT_FILTERS.find((f) => f.key === filter)!.label.toLowerCase()} changes yet.`}
          </Text>
        </TurfCard>
      )}
    </Screen>
  );
}
