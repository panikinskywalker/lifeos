import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Filing } from '@core/repo/filingRepo';
import { confirmSmsAsk, dismissSmsAsk, isSending, settleSmsAsk, smsConfirmed, SETTING_SUBMISSIONS, undoSmsPayment, type PlayerProfileData, type SmsAsk, type TurfSubmission } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Text, useToast } from '@ui/kit';
import { Face } from './teams';

/**
 * To check cards for Turf's own filings (TF-Pieces · To check card), drawn in
 * the app's To check screen and on Home: an SMS payment that needs a Yes, the
 * same one sending once answered, one filed on its own (with Undo), and a
 * profile a friend submitted (Review / Later). People's pronouns aren't known,
 * so the words stay neutral.
 */

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Questions answered Yes this session: Home keeps them, sending, until Turf web has the shares. */
const answered = new Set<string>();
/** Submissions put off with Later this session: drawn collapsed. */
const later = new Set<string>();
export const answeredAsks = () => [...answered];

/** A Turf To check card (p14, r24, gap 12): face, a 15/700 question over a 13/400 line, the white "To check" pill. */
function CardShell({ faceId, name, title, line, pill = 'To check', children }: { faceId: string; name: string; title: string; line?: string | null; pill?: string | null; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ padding: 14, gap: 12, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Face id={faceId} name={name} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="tileTitle" style={{ fontWeight: '700', lineHeight: 20 }}>
            {title}
          </Text>
          {line ? (
            <Text variant="caption" color="tertiary">
              {line}
            </Text>
          ) : null}
        </View>
        {pill ? <Pill label={pill} /> : null}
      </View>
      {children}
    </View>
  );
}

function Pill({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.c.fg.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="labelMicro" color={t.c.bg.ground} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** The 40-tall pill buttons on a card: lime (with an icon) and raised. */
function CardButton({ title, icon, lime, onPress }: { title: string; icon?: string; lime?: boolean; onPress: () => void }) {
  const t = useTheme();
  const fg = lime ? t.c.accent.mustardInk : t.c.fg.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ height: 40, paddingHorizontal: 22, borderRadius: 999, backgroundColor: lime ? t.c.accent.mustard : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text variant="body" color={fg} style={{ fontWeight: '700', lineHeight: 20 }}>
        {title}
      </Text>
    </Pressable>
  );
}

/** A quiet status line under a card: an icon and 13/400 secondary text. */
function StatusLine({ icon, text, tone }: { icon: string; text: string; tone?: 'ok' }) {
  const t = useTheme();
  const c = tone === 'ok' ? t.c.accent.gold : t.c.fg.secondary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={16} color={c} />
      <Text variant="caption" color={c} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/** "Priya paid ₹147 for Sat 19 Sep?" — Yes records it in Turf web and learns the sender; Not this lets it go. */
export function SmsAskCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const toast = useToast();
  const ask = filing.before as unknown as SmsAsk | null;
  const [yes, setYes] = useState(answered.has(filing.id) || smsConfirmed(os, filing.id));
  const s = useLive((o) => ({ name: (ask && o.records.get(ask.personId)?.title) || 'Someone', sending: !!ask && ask.appearanceIds.some((id) => isSending(o, id)) }), [ask?.personId, filing.id]);
  // Once the payment has reached Turf web, the answered question leaves To check.
  useEffect(() => {
    if (!yes || s.sending) return;
    const timer = setTimeout(() => settleSmsAsk(os, filing.id), 1500);
    return () => clearTimeout(timer);
  }, [yes, s.sending, os, filing.id]);
  if (!ask) return null;
  const confirm = () => {
    try {
      answered.add(filing.id);
      setYes(true);
      confirmSmsAsk(os, filing.id);
    } catch (e) {
      answered.delete(filing.id);
      setYes(false);
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const dismiss = () => {
    dismissSmsAsk(os, filing.id);
    toast.show({ message: 'Left as it was · the payment stays in Money', icon: 'check' });
  };
  return (
    <CardShell faceId={ask.personId} name={s.name} title={filing.label} line={filing.flag}>
      {yes ? (
        s.sending ? <StatusLine icon="refresh" text={`Ticking ${firstName(s.name)}’s share paid in Turf web…`} /> : <StatusLine icon="check" tone="ok" text="Ticked in Turf web" />
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <CardButton title="Yes" icon="check" lime onPress={confirm} />
          <CardButton title="Not this" onPress={dismiss} />
        </View>
      )}
    </CardShell>
  );
}

/** A payment filed from an SMS on its own (a known sender, the exact amount): tick it, or Undo. */
export function SmsPaidCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const toast = useToast();
  const b = filing.before as { appearanceIds?: string[]; amount?: number } | null;
  const s = useLive(
    (o) => {
      const first = b?.appearanceIds?.[0] ? o.records.get<{ personId: string }>(b.appearanceIds[0]) : undefined;
      const personId = first?.data.personId ?? filing.id;
      return { personId, name: (first && o.records.get(first.data.personId)?.title) || 'Someone', sending: !!b?.appearanceIds?.some((id) => isSending(o, id)) };
    },
    [filing.id],
  );
  const undo = () => {
    try {
      undoSmsPayment(os, filing.id);
      toast.show({ message: `Taken back · ${firstName(s.name)}’s share is open again`, icon: 'undo' });
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  return (
    <CardShell faceId={s.personId} name={s.name} title={filing.label} line={s.sending ? 'Filed from an SMS · sending to Turf web…' : 'Filed from an SMS · in Turf web'}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <CardButton title="Looks right" icon="check" lime onPress={() => os.filings.setChecked(filing.id)} />
        <CardButton title="Undo" icon="undo" onPress={undo} />
      </View>
    </CardShell>
  );
}

/** A friend's profile, submitted through an invite link or their page: Review opens it; Later folds it away. */
export function SubmissionCard({ filing }: { filing: Filing }) {
  const t = useTheme();
  const router = useRouter();
  const [folded, setFolded] = useState(later.has(filing.id));
  const s = useLive(
    (o) => {
      const sub = filing.sourceRef ? o.settings.get<Record<string, TurfSubmission>>(SETTING_SUBMISSIONS, {})[filing.sourceRef] : undefined;
      const profile = filing.entityId ? o.records.get<PlayerProfileData>(filing.entityId) : undefined;
      const name = profile?.data.name ?? sub?.name ?? filing.label.replace(/ submitted their profile$/, '');
      return { name, faceId: profile?.data.personId ?? sub?.playerId ?? filing.id, fromPage: !!sub?.fromPage };
    },
    [filing.id],
  );
  const title = `${firstName(s.name)} ${s.fromPage ? 'edited' : 'submitted'} their profile`;
  const review = () => filing.sourceRef && router.push(`/board/turf/submission?sub=${encodeURIComponent(filing.sourceRef)}` as never);
  if (folded) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}. Show`} onPress={() => (later.delete(filing.id), setFolded(false))} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 12, paddingRight: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
        <Face id={s.faceId} name={s.name} size={28} />
        <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Review ${firstName(s.name)}’s profile`} hitSlop={10} onPress={review}>
          <Text variant="caption" color={t.c.accent.gold} style={{ fontWeight: '700' }}>
            Review
          </Text>
        </Pressable>
      </Pressable>
    );
  }
  return (
    <CardShell faceId={s.faceId} name={s.name} title={title} line={filing.flag}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <CardButton title="Review" icon="eye" lime onPress={review} />
        <CardButton title="Later" onPress={() => (later.add(filing.id), setFolded(true))} />
      </View>
    </CardShell>
  );
}
