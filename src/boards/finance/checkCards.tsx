import React from 'react';
import { Pressable, View } from 'react-native';
import type { Filing } from '@core/repo/filingRepo';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Text, useToast } from '@ui/kit';
import type { InvestmentData, TransactionData } from '@modules/finance/types';
import { NACH_SIP, answerSip, undoSip } from '@modules/finance/filing/sip';
import { SPOTTED_SUB, notSpotted, trackSpotted, undoSpotted } from '@modules/finance/filing/recurring';
import { Caps } from './parts';

/** A Money question in To check (NR-Money-Ask-Odd's card): a caps line with its icon, the question, a line, the answers. */
function MoneyCard({ caps, icon, color, title, line, children }: { caps: string; icon: string; color: string; title: string; line?: string | null; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={16} color={color} />
        <Caps color={color}>{caps}</Caps>
      </View>
      <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 }}>{title}</Text>
      {line ? <Text color="secondary" style={{ fontSize: 14, lineHeight: 20 }}>{line}</Text> : null}
      {children}
    </View>
  );
}

/** A 48-high answer: lime for the likely one, grey for the rest. */
function Answer({ title, lime, onPress }: { title: string; lime?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ flexGrow: 1, flexBasis: '45%', minHeight: 48, paddingHorizontal: 14, borderRadius: 999, backgroundColor: lime ? t.c.accent.mustard : t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: lime ? t.c.accent.mustardInk : t.c.fg.primary }}>{title}</Text>
    </Pressable>
  );
}

/** "₹2,000 by NACH on Mon 5 Oct: a SIP?": each active holding, New SIP, Not a SIP. */
function NachSipCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const holdings = useLive((o) => (o.registry.objects.has('investment') ? o.records.query<InvestmentData>('investment', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }, { limit: 50 }) : []), []);
  const tx = useLive((o) => (filing.entityId ? o.records.get<TransactionData>(filing.entityId) : undefined), [filing.entityId]);
  const answer = (pick: string, message: string) => {
    const a = answerSip(os, filing.id, pick);
    if (a) toast.show({ message, icon: 'check', undo: () => undoSip(os, a) });
  };
  const amount = tx ? os.format.currency(tx.data.amount) : '';
  return (
    <MoneyCard caps="A SIP?" icon="trend" color={t.c.accent.gold} title={filing.label} line="The bank names nobody. If it is a SIP it counts as investing, not spending, and the next one files itself.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {holdings.map((h, i) => (
          <Answer key={h.id} title={h.title} lime={i === 0 && holdings.length === 1} onPress={() => answer(h.id, `${amount} is your ${h.title} SIP`)} />
        ))}
        <Answer title="New SIP" lime={!holdings.length} onPress={() => answer('new', `${amount} is a new SIP · rename it on its page`)} />
        <Answer title="Not a SIP" onPress={() => answer('no', `Not a SIP · ${amount} by NACH stays spending`)} />
      </View>
    </MoneyCard>
  );
}

/** "Spotify, ₹299 every month: track it?": Track it, Not a subscription. */
function SpottedSubCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const count = ((filing.before as { txIds?: string[] } | null)?.txIds ?? []).length;
  const track = () => {
    const id = trackSpotted(os, filing.id);
    if (id) toast.show({ message: 'Tracked · in Subscriptions', icon: 'check', undo: () => undoSpotted(os, filing.id, id) });
  };
  const no = () => {
    notSpotted(os, filing.id);
    toast.show({ message: 'Not a subscription · won’t ask again', icon: 'check', undo: () => undoSpotted(os, filing.id, null) });
  };
  return (
    <MoneyCard caps="EVERY MONTH?" icon="repeat" color={t.c.accent.gold} title={filing.label} line={`${count || 3} payments, about a month apart.`}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Answer title="Track it" lime onPress={track} />
        <Answer title="Not a subscription" onPress={no} />
      </View>
    </MoneyCard>
  );
}

export const financeCheckCards = { [NACH_SIP]: NachSipCard, [SPOTTED_SUB]: SpottedSubCard };
