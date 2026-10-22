import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { sourceState } from '@core/sources/deviceData';
import { turfBase, turfChanges } from '@modules/games';
import { runSource } from '@core/filing/sources';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Icon, Sheet, Text, useToast } from '@ui/kit';

/**
 * Turf · Noir board states (TF-S-NotConnected, TF-S-Loading, TF-S-Offline,
 * TF-S-Error, TF-S-Settled, TF-S-Tentative) and the sync pills and banners
 * of TF-Pieces. Everything reads the Turf source's state (last sync, error)
 * and the changes still on their way to Turf web.
 */

const DIM = '#FFFFFF12'; // rgba(255,255,255,0.07)

/* ------------------------------------------------------------------ */
/* Where the sync stands                                               */
/* ------------------------------------------------------------------ */

export type TurfStatusKind = 'synced' | 'sending' | 'offline' | 'error' | 'pulling' | 'off';

export interface TurfStatus {
  kind: TurfStatusKind;
  lastSync: number | null;
  error: string | null;
  /** Changes waiting to reach Turf web. */
  waiting: number;
  refused: number;
}

/** Not connected (no address, or nothing pulled yet) · pulling · offline with changes waiting · couldn't reach · sending · synced. */
export function turfStatus(os: LifeOSContext, busy = false): TurfStatus {
  const st = sourceState(os, 'turf');
  const { sending, refused } = turfChanges(os);
  const base = { lastSync: st.lastSync, error: st.error, waiting: sending.length, refused: refused.length };
  if (busy) return { ...base, kind: 'pulling' };
  if (!turfBase(os) || (!st.lastSync && !st.error)) return { ...base, kind: 'off' };
  if (st.error) return { ...base, kind: sending.length ? 'offline' : 'error' };
  if (sending.length) return { ...base, kind: 'sending' };
  return { ...base, kind: 'synced' };
}

export function useTurfStatus(busy = false) {
  return useLive((o) => turfStatus(o, busy), [busy]);
}

const clock = (at: number) => format(at, 'H:mm');

/* ------------------------------------------------------------------ */
/* Sync pills (TF-Pieces · Sync pills)                                 */
/* ------------------------------------------------------------------ */

/** A 28 quiet pill with a 6 dot: lime when synced, grey while sending or pulling, coral offline or not connected. */
export function SyncPillView({ dot, label, quiet }: { dot: string; label: string; /** 42 % text (Synced); otherwise 62 % */ quiet?: boolean }) {
  return (
    <View accessibilityRole="text" accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: DIM }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
      <Text variant="labelMicro" color={quiet ? 'tertiary' : 'secondary'} numberOfLines={1} style={{ fontSize: 11, lineHeight: 14 }}>
        {label}
      </Text>
    </View>
  );
}

/** The header pill: Synced 9:40 · Sending 2 · Offline · 3 waiting · Not connected · Pulling… */
export function TurfSyncPill({ busy }: { busy?: boolean }) {
  const t = useTheme();
  const s = useTurfStatus(!!busy);
  switch (s.kind) {
    case 'pulling':
      return <SyncPillView dot={t.c.fg.secondary} label="Pulling…" />;
    case 'sending':
      return <SyncPillView dot={t.c.fg.secondary} label={`Sending ${s.waiting}`} />;
    case 'offline':
      return <SyncPillView dot={t.c.alert.coral} label={`Offline · ${s.waiting} waiting`} />;
    case 'error':
    case 'off':
      return <SyncPillView dot={t.c.alert.coral} label="Not connected" />;
    default:
      return <SyncPillView dot={t.c.accent.mustard} label={`Synced ${clock(s.lastSync!)}`} quiet />;
  }
}

/* ------------------------------------------------------------------ */
/* Banners (TF-Pieces · Banners; TF-S-Offline, TF-S-Error)            */
/* ------------------------------------------------------------------ */

function Banner({ dot, fill, line, action, actionColor, onAction }: { dot: string; fill: string; line: string; action: string; actionColor: string; onAction: () => void }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: fill }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
      <Text variant="caption" style={{ flex: 1, fontWeight: '600' }}>
        {line}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={12} onPress={onAction}>
        <Text variant="caption" color={actionColor} style={{ fontWeight: '700' }}>
          {action}
        </Text>
      </Pressable>
    </View>
  );
}

/** "3 changes waiting · sent when you’re back online · See": shown while Turf web can't be reached and changes are queued. See lists them. */
export function OfflineBanner({ onSee }: { onSee?: () => void }) {
  const t = useTheme();
  const s = useTurfStatus();
  const waiting = useLive((o) => turfChanges(o).sending, []);
  const [open, setOpen] = useState(false);
  if (s.kind !== 'offline') return null;
  return (
    <>
      <Banner dot={t.c.accent.mustard} fill={t.c.bg.tile} line={`${s.waiting} change${s.waiting === 1 ? '' : 's'} waiting · sent when you’re back online`} action="See" actionColor={t.c.accent.mustard} onAction={onSee ?? (() => setOpen(true))} />
      {onSee ? null : (
        <Sheet visible={open} onClose={() => setOpen(false)} title="Waiting to send">
          <View style={{ gap: 8 }}>
            {waiting.map((i, n) => (
              <View key={i.id} style={{ gap: 8 }}>
                {n ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="clock" size={16} color={t.c.fg.tertiary} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="tileTitle" numberOfLines={2}>
                      {i.label}
                    </Text>
                    <Text variant="caption" color="tertiary" numberOfLines={2}>
                      {i.error ?? `Made ${format(i.createdAt, 'd MMM, H:mm')}`}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
            <Text variant="caption" color="tertiary" style={{ paddingTop: 4 }}>
              They go to Turf web in the order you made them, as soon as it can be reached.
            </Text>
          </View>
        </Sheet>
      )}
    </>
  );
}

/** Turf web's own explanations (a refused key, a wrong address) are shown as they are; anything else reads as "couldn't reach". */
const explained = (e: string) => /^(Turf web refused|No Turf web|Turf web sent a page|Turf web answered|Add Turf web)/.test(e);

/** "Couldn’t reach Turf web. Showing what you had at 9:40. · Retry": the last sync failed and nothing is waiting. */
export function ErrorBanner({ onRetry }: { onRetry?: () => void }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const s = useTurfStatus();
  // A pull through core, without the board's minute timer (the screen already runs one).
  const retry = async () => {
    const src = os.registry.sources.get('turf');
    if (!src) return;
    try {
      await runSource(os, src);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  if (s.kind !== 'error' || !s.error) return null;
  const why = explained(s.error) ? s.error.replace(/\.?$/, '.') : 'Couldn’t reach Turf web.';
  return <Banner dot={t.c.alert.coral} fill={t.c.alert.coralFill} line={s.lastSync ? `${why} Showing what you had at ${clock(s.lastSync)}.` : why} action="Retry" actionColor={t.c.alert.coralText} onAction={onRetry ?? (() => void retry())} />;
}

/** Whichever banner applies (offline or couldn't reach), or nothing. */
export function SyncBanners({ onRetry }: { onRetry?: () => void }) {
  return (
    <>
      <OfflineBanner />
      <ErrorBanner onRetry={onRetry} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Not connected (TF-S-NotConnected)                                   */
/* ------------------------------------------------------------------ */

/** The data-source glyph (a stack of disks), drawn here: the icon set has none. */
export function SourceGlyph({ size = 26, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Ellipse cx={12} cy={5} rx={9} ry={3} />
      <Path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <Path d="M3 12a9 3 0 0 0 18 0" />
    </Svg>
  );
}

/** "Turf isn’t connected yet": a 28 card, the source disc, one line, Connect Turf web (You › Data sources). */
export function NotConnectedCard() {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 14, paddingBottom: 6 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <SourceGlyph color={t.c.accent.mustard} />
        </View>
        <Text variant="heading" style={{ textAlign: 'center' }}>
          Turf isn’t connected yet
        </Text>
        <Text variant="caption" color="secondary" style={{ textAlign: 'center', maxWidth: 280 }}>
          Your games, players and venues live in Turf web. Connect it and they appear here.
        </Text>
        <View style={{ marginTop: 6, gap: 8, alignItems: 'center' }}>
          <Button title="Connect Turf web" icon="link" size="sm" onPress={() => router.push('/settings/turf' as never)} />
          <Text variant="caption" color="tertiary">
            You › Data sources
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Loading (TF-S-Loading)                                              */
/* ------------------------------------------------------------------ */

function Bar({ w, h, r = 7 }: { w: number | `${number}%`; h: number; r?: number }) {
  return <View style={{ width: w, height: h, borderRadius: r, backgroundColor: DIM }} />;
}

function Heading({ children }: { children: string }) {
  return (
    <View style={{ paddingTop: 6, paddingHorizontal: 4 }}>
      <Text variant="heading">{children}</Text>
    </View>
  );
}

function SkeletonTile() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, padding: 14, borderRadius: 22, backgroundColor: t.c.bg.tile, gap: 6 }}>
      <Bar w="40%" h={10} />
      <View style={{ height: 10 }} />
      <Bar w="60%" h={22} r={8} />
      <Bar w="50%" h={10} />
    </View>
  );
}

/** The first pull: the Home layout in skeleton (money tiles, the next match, who still owes) and "Pulling from Turf web…". */
export function LoadingState() {
  const t = useTheme();
  return (
    <View accessibilityLabel="Pulling from Turf web" accessibilityState={{ busy: true }} style={{ gap: 12 }}>
      <Heading>Money at a glance</Heading>
      {[0, 1].map((row) => (
        <View key={row} style={{ flexDirection: 'row', gap: 10 }}>
          <SkeletonTile />
          <SkeletonTile />
        </View>
      ))}
      <Heading>Next match</Heading>
      <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 10 }}>
        <Bar w="50%" h={14} />
        <Bar w="80%" h={12} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Bar w={120} h={26} r={13} />
          <Bar w={90} h={26} r={13} />
        </View>
      </View>
      <Heading>Who still owes</Heading>
      <View style={{ padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ gap: 8 }}>
            {i ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Bar w={40} h={40} r={20} />
              <View style={{ flex: 1, gap: 8 }}>
                <Bar w="55%" h={12} />
                <Bar w="35%" h={10} />
              </View>
              <Bar w={48} h={24} r={12} />
            </View>
          </View>
        ))}
      </View>
      <Text variant="caption" color="tertiary">
        Pulling from Turf web…
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Match states (TF-S-Settled, TF-S-Tentative)                         */
/* ------------------------------------------------------------------ */

/** The match card's 28 info pill (venue, format, state): 12/600 at 62 % on the quiet fill, an optional 13 icon. */
export function MatchPill({ label, icon }: { label: string; icon?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: DIM }}>
      {icon ? <Icon name={icon} size={13} color={t.c.fg.secondary} /> : null}
      <Text variant="labelMicro" color="secondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Every share paid (TF-S-Settled). */
export function SettledBadge() {
  return <MatchPill label="Settled" />;
}

/** Not yet confirmed: dues are paused (TF-S-Tentative). */
export function TentativeBadge() {
  return <MatchPill label="Tentative" icon="clock" />;
}
