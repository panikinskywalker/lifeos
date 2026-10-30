import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { Filing } from '@core/repo/filingRepo';
import type { LifeOSContext } from '@core/registry/context';
import { resolveCandidates } from '@core/ai/lifeTools';
import { whoIs } from '@core/identity';
import { messageItem, sourceLabel } from '@core/filing/messages';
import { BUILTIN_RELATIONSHIPS, customRelationships, listItems, type PersonData } from '@modules/crm';
import { answerWhoIs, confirmPayee, keepWhoAsOrg, rejectPayee, whoAskOf } from '@modules/finance/filing/payee';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { Icon, Text, useToast } from '@ui/kit';
import { Face, Label } from './parts';

/**
 * Who is this? (NR-People-WhoIs): To check cards for payments People can
 * answer. A new sender — a UPI ID no one has, under a person's name — asks
 * once: a name match ("This"), a new person started with the UPI ID, or a
 * shop; the answer is remembered for every payment after. A guess ("We
 * think JOHN D is John Doe") is Yes or Not them. The crm board registers
 * these as `checkCards`.
 */

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (m) => m.toUpperCase());

/** "₹147 in · Sat 19 Sep · HDFC Bank SMS": the payment, as a card's second line. */
export function paymentLine(os: LifeOSContext, txId: string | null, sourceRef?: string | null, extra?: string): string {
  const tx = txId ? os.records.get<{ amount?: number; kind?: string; date?: string }>(txId) : null;
  const money = tx?.data.amount != null ? `${os.format.currency(tx.data.amount)} ${tx.data.kind === 'income' ? 'in' : 'out'}` : null;
  const day = tx?.data.date ? format(new Date(`${tx.data.date}T00:00:00`), 'EEE d MMM') : null;
  const msg = sourceRef ? messageItem(os, sourceRef) : null;
  return [money, day, msg ? sourceLabel(os, msg) : null, extra].filter(Boolean).join(' · ');
}

/** The card (p18, r28, gap 14) on the To check list's raised slab. */
function Card({ children, gap = 14 }: { children: React.ReactNode; gap?: number }) {
  const t = useTheme();
  return <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap }}>{children}</View>;
}

function Hairline() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
}

/** A 32-high "This" pill: lime for the best match, raised for the rest. */
function SmallPill({ title, lime, onPress, label }: { title: string; lime?: boolean; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: lime ? t.c.accent.mustard : t.c.bg.tileRaised, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontSize: 13, lineHeight: 20, fontWeight: '700', color: lime ? t.c.accent.mustardInk : t.c.fg.primary }}>{title}</Text>
    </Pressable>
  );
}

/** A 44-high full-width pill (Yes, John · Not them). */
function WidePill({ title, icon, lime, onPress }: { title: string; icon: string; lime?: boolean; onPress: () => void }) {
  const t = useTheme();
  const fg = lime ? t.c.accent.mustardInk : t.c.fg.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ flex: 1, height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: lime ? t.c.accent.mustard : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
      <Icon name={icon} size={18} color={fg} />
      <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: fg, flexShrink: 1 }}>
        {title}
      </Text>
    </Pressable>
  );
}

/** A choice row with a raised 40 disc and a chevron (New person… · It's a shop or company). */
function ChoiceRow({ icon, title, line, onPress }: { icon: string; title: string; line: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${line}`} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color={t.c.fg.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="rowTitle" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {line}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
    </Pressable>
  );
}

/** A NEW SENDER: "Who is priya.s@okicici?" — This (a person), New person…, or It's a shop or company. */
export function WhoIsCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const ask = whoAskOf(filing);
  const [q, setQ] = useState('');
  const line = useMemo(() => paymentLine(os, filing.entityId, filing.sourceRef), [os, filing.entityId, filing.sourceRef]);
  const rel = useLive((o) => new Map([...BUILTIN_RELATIONSHIPS, ...customRelationships(o)].map((r) => [r.value, r.label])), []);
  // Someone who has this UPI ID now (made with New person…, or typed on their page): the answer.
  const owner = useLive((o) => {
    const w = ask ? whoIs(o, { upi: ask.vpa }, ['person']) : null;
    return w && (w.by === 'upi' || w.by === 'alias') ? w.record : null;
  }, [ask?.vpa]);
  const people = useLive(
    (o) => {
      if (!ask) return [];
      const said = q.trim() || ask.said || ask.vpa.split('@')[0]!.replace(/[._-]+/g, ' ');
      return resolveCandidates(o, said, ['person'])
        .filter((c) => c.score >= (q.trim() ? 0.2 : 0.45))
        .slice(0, q.trim() ? 5 : 3)
        .map((c) => o.records.get<PersonData>(c.id))
        .filter((p): p is NonNullable<typeof p> => !!p);
    },
    [ask?.vpa, q],
  );
  const answer = (personId: string, name: string, auto = false) => {
    if (!ask) return;
    answerWhoIs(os, filing.id, personId);
    toast.show({ message: `${auto ? 'Answered' : 'Linked to'} ${firstName(name)} · every payment from ${ask.vpa} is theirs now`, icon: 'check' });
  };
  useEffect(() => {
    if (owner && ask && !filing.checked) answer(owner.id, owner.title, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner?.id]);
  if (!ask) return null;
  const sub = (p: { data: PersonData }) => {
    const r = p.data.relationship ? rel.get(p.data.relationship) ?? null : null;
    const reach = p.data.email || p.data.phone || (listItems(p.data.upi)[0] ?? 'no UPI yet');
    return [r, reach].filter(Boolean).join(' · ');
  };
  const newPerson = () => router.push(`/entity/person/new?upi=${encodeURIComponent(ask.vpa)}${ask.said ? `&title=${encodeURIComponent(titleCase(ask.said))}` : ''}` as never);
  const shop = () => {
    keepWhoAsOrg(os, filing.id);
    toast.show({ message: `Kept as an organisation · ${ask.vpa} means it from now on`, icon: 'briefcase' });
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="user" size={20} color={t.c.fg.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="heading">Who is {ask.vpa}?</Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {line}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingLeft: 18, paddingRight: 10, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line }}>
        <Icon name="search" size={18} color={t.c.fg.secondary} />
        <TextInput accessibilityLabel="Search people" value={q} onChangeText={setQ} placeholder="Search people" placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} cursorColor={t.c.accent.mustard} autoCorrect={false} style={{ flex: 1, color: t.c.fg.primary, fontFamily: fontForWeight(500), fontSize: 16, lineHeight: 21, paddingVertical: 12 }} />
        {q ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQ('')}>
            <Icon name="x-circle" size={18} color={t.c.fg.tertiary} />
          </Pressable>
        ) : null}
      </View>
      {people.length ? <Label>{q.trim() ? 'People' : 'Suggested · name match'}</Label> : null}
      <View style={{ gap: 8 }}>
        {people.map((p, i) => (
          <React.Fragment key={p.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
              <Face id={p.id} name={p.title} photo={p.data.photo?.uri} size={40} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="rowTitle" numberOfLines={1}>
                  {p.title}
                </Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {sub(p)}
                </Text>
              </View>
              <SmallPill title="This" lime={i === 0} label={`${ask.vpa} is ${p.title}`} onPress={() => answer(p.id, p.title)} />
            </View>
            <Hairline />
          </React.Fragment>
        ))}
        <ChoiceRow icon="plus" title="New person…" line="Starts the form with this UPI ID" onPress={newPerson} />
        <Hairline />
        <ChoiceRow icon="briefcase" title="It’s a shop or company" line="Goes to Organisations instead" onPress={shop} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: t.c.bg.tileRaised }}>
        <Icon name="info" size={16} color={t.c.fg.secondary} />
        <Text variant="caption" color="secondary" style={{ flex: 1 }}>
          Answer once. LifeOS remembers this UPI ID for every payment after.
        </Text>
      </View>
    </Card>
  );
}

/**
 * A GUESS: "We think JOHN D is John Doe" on a payment — Yes links and
 * teaches the name, Not them keeps a separate payee. Reads the guessed link
 * from the filing's payment (`before.relationId`, else the payment's own
 * guessed link), so it fits a 'payee-guess' filing or a flagged transaction.
 */
export function GuessCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const toast = useToast();
  const g = useLive(
    (o) => {
      const relId = typeof filing.before?.relationId === 'string' ? (filing.before.relationId as string) : null;
      const links = filing.entityId ? o.links.forEntity(filing.entityId) : [];
      const hit = relId ? links.find((r) => r.relation.id === relId) : links.find((r) => r.direction === 'out' && (r.relation.confidence ?? 1) < 1 && r.relation.meta.guess);
      if (!hit || (hit.relation.confidence ?? 1) >= 1) return null;
      const p = o.records.get<PersonData>(hit.other.id);
      return { id: hit.relation.id, personId: hit.other.id, name: hit.other.title, photo: p?.data.photo?.uri ?? null, said: (hit.relation.meta.as as string | undefined) ?? null, text: String(hit.relation.meta.guess) };
    },
    [filing.id, filing.entityId],
  );
  const line = useMemo(() => paymentLine(os, filing.entityId, filing.sourceRef, 'name on the UPI'), [os, filing.entityId, filing.sourceRef]);
  if (!g) return null;
  const title = g.said ? `We think ${g.said} is ${g.name}` : g.text.replace(/[“”]/g, '');
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 }}>
        <Face id={g.personId} name={g.name} photo={g.photo} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="rowTitle" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {line}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <WidePill
          title={`Yes, ${firstName(g.name)}`}
          icon="check"
          lime
          onPress={() => {
            confirmPayee(os, g.id);
            os.filings.setChecked(filing.id);
            toast.show({ message: `Linked to ${g.name} · next time it’s automatic`, icon: 'check' });
          }}
        />
        <WidePill
          title="Not them"
          icon="x"
          onPress={() => {
            rejectPayee(os, g.id);
            os.filings.setChecked(filing.id);
            toast.show({ message: 'Kept as a separate payee', icon: 'people' });
          }}
        />
      </View>
    </Card>
  );
}
