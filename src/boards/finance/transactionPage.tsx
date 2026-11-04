import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { messageItem, sourceLabel } from '@core/filing/messages';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { monoFonts } from '@ui/theme/tokens';
import { Icon, Text } from '@ui/kit';
import { categoryOf, type AccountData, type TransactionData } from '@modules/finance/types';
import type { DebtData } from '@modules/finance/split';
import { PayeeGuess } from './payeeGuess';
import { SplitBlock } from './splitScreens';
import { Caps, Disc, FieldRow, FieldValue, Hairline, IconDisc, RecordBar, RecordExtras, SectionHead, SmallPill, StatusPill, accountName, catColor, day, signedAmount, splitOf } from './parts';

const KIND: Record<TransactionData['kind'], string> = { expense: 'Spent', income: 'Received', transfer: 'Transfer', investment: 'Investment' };
const SIXTY_DAYS = 60 * 86_400_000;
const when = (at: number) => format(new Date(at), 'EEE d MMM, h:mm a');

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'], color }}>{value}</Text>
      <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 15, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

/** A Transaction's page (NR-Money-Transaction): the amount, the split, its Fields, Links, where it came from, what happened to it, Tell me. */
export function TransactionPage({ entity, ctx, controls, say }: { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: React.ReactNode }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = useTheme();
  const router = useRouter();
  const tx = entity as ObjectRecord<TransactionData>;
  const d = tx.data;
  const money = ctx.format.currency;
  const v = useLive(
    (o) => {
      const links = o.links.forEntity(tx.id).filter((l) => l.relation.kind !== 'mention');
      const account = d.accountId ? o.records.get<AccountData>(d.accountId) : null;
      const toAccount = d.toAccountId ? o.records.get<AccountData>(d.toAccountId) : null;
      const msg = d.sourceRef ? messageItem(o, d.sourceRef) : null;
      const debts = o.records.query<DebtData>('debt', { filter: { and: [{ field: 'data.transactionId', op: 'eq', value: tx.id }, { field: 'status', op: 'neq', value: 'settled' }] } }, { limit: 100 });
      return { links, account, toAccount, msg, source: msg ? sourceLabel(o, msg) : null, debts: debts.length, events: o.records.timeline.forEntity(tx.id, 6) };
    },
    [tx.id, tx.version],
  );
  const status = ctx.registry.object('transaction').statuses?.find((s) => s.value === tx.status)?.label;
  const split = splitOf(d);
  const mine = split?.shares.find((s) => s.party === 'me')?.amount ?? 0;
  const paidByMe = split?.payer === 'me';
  // The time, when we know it: the message's, or when you added it that same day.
  const at = v.msg?.receivedAt ?? (format(new Date(tx.createdAt), 'yyyy-MM-dd') === d.date ? tx.createdAt : null);

  const payeeLink = v.links.find((l) => l.relation.kind === 'payee') ?? v.links.find((l) => l.relation.kind === 'person' && l.relation.meta.as != null);
  const people = v.links.filter((l) => l.other.object === 'person' && l !== payeeLink);
  const others = v.links.filter((l) => l !== payeeLink && l.other.object !== 'person' && l.other.object !== 'account' && l.other.object !== 'debt');
  const open = (object: string, id: string) => router.push(`/entity/${object}/${id}` as never);
  const objectWord = (object: string) => (ctx.registry.hasObject(object) ? ctx.registry.object(object).label : object);
  const typedBy = d.source === 'dump' ? 'From a Dump' : d.source === 'cycle' ? 'From a Cycle' : 'Filed on its own';
  const showSource = !!v.msg || (!!d.source && d.source !== 'manual');
  const raw = d.rawText ?? v.msg?.text;
  const filedAt = v.msg?.receivedAt ?? tx.createdAt;
  const by = (actor: string) => (actor === 'user' ? 'by you' : actor === 'assistant' ? 'by Dump' : actor === 'automation' ? 'by an automation' : null);

  return (
    <View style={{ paddingHorizontal: t.layout.gutter, gap: 24 }}>
      {controls ? <RecordBar label="Transaction" controls={controls} /> : null}

      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Disc name={tx.title} size={56} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={2} accessibilityRole="header" style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.8 }}>{tx.title}</Text>
            <Text variant="caption" color="secondary">{[format(day(d.date), 'EEE d MMM'), at ? format(new Date(at), 'h:mm a') : null].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 48, lineHeight: 50, fontWeight: '700', letterSpacing: -1.8, fontVariant: ['tabular-nums'], color: d.kind === 'income' ? t.c.accent.gold : t.c.fg.primary }}>{signedAmount(d, money)}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill label={categoryOf(d.category).label} dot={catColor(d.category, t)} />
          {status ? <StatusPill label={status} /> : null}
          {split ? <StatusPill lime label={`Split ${split.parts.length} ways`} /> : null}
          {d.originalCurrency ? <StatusPill label={`${d.originalCurrency} ${d.originalAmount}`} /> : null}
        </View>
        {split || v.account ? (
          <View style={{ flexDirection: 'row', gap: 14, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.c.line }}>
            {split ? <Stat value={money(mine)} label="your share" /> : null}
            {split ? (paidByMe ? <Stat value={money(d.amount - mine)} label="owed to you" color={t.c.accent.gold} /> : <Stat value={money(mine)} label="you owe" color={t.c.alert.coralText} />) : null}
            {v.account ? <Stat value={v.account.data.last4 ? `··${v.account.data.last4}` : v.account.title} label={v.account.title} /> : null}
          </View>
        ) : null}
      </View>

      <PayeeGuess entity={tx} ctx={ctx} />

      <SplitBlock entity={tx} ctx={ctx} />

      <View style={{ gap: 10 }}>
        <SectionHead title="Fields" />
        <View style={{ paddingVertical: 6, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          {[
            payeeLink ? (
              <FieldRow key="payee" label={d.kind === 'income' ? 'Paid by' : 'Paid to'}>
                <Pressable accessibilityRole="button" accessibilityLabel={payeeLink.other.title} hitSlop={6} onPress={() => open(payeeLink.other.object, payeeLink.other.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, maxWidth: '100%' }}>
                  <Icon name={payeeLink.other.object === 'person' ? 'user' : 'bank'} size={14} color={t.c.fg.primary} />
                  <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{payeeLink.other.title}</Text>
                </Pressable>
              </FieldRow>
            ) : null,
            d.merchant ? (
              <FieldRow key="merchant" label="As the bank wrote it">
                <Text style={{ fontSize: 14, lineHeight: 18, fontFamily: monoFonts[500] }}>{d.merchant}</Text>
              </FieldRow>
            ) : null,
            <FieldRow key="kind" label="Kind"><FieldValue>{KIND[d.kind]}</FieldValue></FieldRow>,
            v.account ? <FieldRow key="account" label="Account"><FieldValue>{accountName(v.account)}</FieldValue></FieldRow> : null,
            v.toAccount ? <FieldRow key="to" label="To account"><FieldValue>{accountName(v.toAccount)}</FieldValue></FieldRow> : null,
            d.note ? (
              <FieldRow key="note" label="Note" top>
                <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '500' }}>{d.note}</Text>
              </FieldRow>
            ) : null,
          ]
            .filter(Boolean)
            .map((row, i) => (
              <React.Fragment key={i}>
                {i ? <Hairline /> : null}
                {row}
              </React.Fragment>
            ))}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHead title="Links" action="Open Links" chevron onAction={() => router.push(`/links/${tx.id}` as never)} />
        <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14 }}>
          {payeeLink ? (
            <View style={{ gap: 8 }}>
              <Caps>PAYEE</Caps>
              <Pressable accessibilityRole="button" accessibilityLabel={payeeLink.other.title} onPress={() => open(payeeLink.other.object, payeeLink.other.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
                <Disc name={payeeLink.other.title} colorKey={payeeLink.other.id} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{payeeLink.other.title}</Text>
                  <Text color="secondary" style={{ fontSize: 12, lineHeight: 15 }}>{objectWord(payeeLink.other.object)}</Text>
                </View>
              </Pressable>
              <Hairline />
            </View>
          ) : null}
          {people.length ? (
            <View style={{ gap: 8 }}>
              <Caps>{`PEOPLE · ${people.length}`}</Caps>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {people.map((l) => (
                  <Pressable key={l.relation.id} accessibilityRole="button" accessibilityLabel={l.other.title} hitSlop={4} onPress={() => open('person', l.other.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 4, paddingRight: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
                    <Disc name={l.other.title} colorKey={l.other.id} size={28} />
                    <Text variant="label" numberOfLines={1}>{l.other.title.split(' ')[0]}</Text>
                  </Pressable>
                ))}
              </View>
              <Hairline />
            </View>
          ) : null}
          {v.debts ? (
            <View style={{ gap: 8 }}>
              <Caps>{`DEBTS · ${v.debts} OPEN`}</Caps>
              <Text color="secondary" style={{ fontSize: 14, lineHeight: 18 }}>{v.debts === 1 ? 'From this split' : 'One per person, from this split'}</Text>
              <Hairline />
            </View>
          ) : null}
          {others.map((l) => (
            <View key={l.relation.id} style={{ gap: 8 }}>
              <Caps>{objectWord(l.other.object).toUpperCase()}</Caps>
              <Pressable accessibilityRole="button" accessibilityLabel={l.other.title} onPress={() => open(l.other.object, l.other.id)} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{l.other.title}</Text>
              </Pressable>
              <Hairline />
            </View>
          ))}
          {controls ? <SmallPill title="Add a link" icon="plus" iconColor={t.c.accent.gold} onPress={controls.link} /> : null}
        </View>
      </View>

      {showSource ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Source" />
          <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconDisc icon="comment" color={t.c.fg.primary} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{v.source ?? (ctx.registry.object('transaction').fields.find((f) => f.key === 'source')?.options?.find((o) => o.value === d.source)?.label ?? 'Message')}</Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>{typedBy} · {when(filedAt)}</Text>
              </View>
            </View>
            {raw ? (
              <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.c.bg.tileRaised }}>
                <Text style={{ fontFamily: monoFonts[500], fontSize: 12, lineHeight: 18, color: t.c.fg.primary, opacity: 0.82 }}>{raw}</Text>
              </View>
            ) : null}
            {raw ? <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>Original text kept 60 days after filing, until {format(new Date(filedAt + SIXTY_DAYS), 'EEE d MMM')}</Text> : null}
          </View>
        </View>
      ) : null}

      {v.events.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Events" />
          <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
            {v.events.map((e, i) => {
              const last = i === v.events.length - 1;
              return (
                <View key={e.id} style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ width: 14, alignItems: 'center' }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: i === 0 ? t.c.accent.mustard : t.c.fg.tertiary }} />
                    {last ? null : <View style={{ width: 2, flex: 1, marginTop: 4, backgroundColor: t.c.line }} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2, paddingBottom: last ? 0 : 16 }}>
                    <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{e.title}</Text>
                    <Text variant="caption" color="secondary">{[when(e.occurredAt), by(e.actor), e.body].filter(Boolean).join(' · ')}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <RecordExtras entity={tx} module="finance" />

      {say}
    </View>
  );
}
