import React from 'react';
import { Linking, View } from 'react-native';
import { format } from 'date-fns';
import type { Entity } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { logDone, undoLoggedDone } from '@core/cycles/upkeep';
import { useLive } from '@ui/hooks';
import { AttentionCard, QuickActions, RowList, Section, StatTrio, useToast } from '@ui/kit';
import { EntityRow } from '@ui/components/EntityRow';
import type { SubscriptionData } from '@modules/finance/types';
import { perMonth } from '@modules/finance/reports';

/**
 * Subscription (Stitch "Record · Subscription"): per month / next bill /
 * paid this year, a renewal nudge when it won't auto-post, quick actions,
 * billing history.
 */
export function SubscriptionHero({ entity, ctx }: { entity: Entity<any>; ctx: LifeOSContext }) {
  const toast = useToast();
  const s = entity as Entity<SubscriptionData>;
  const posted = useLive((os) => os.relations.forEntity(entity.id, 'subscription').map((r) => os.entities.get<{ date: string; amount: number }>(r.other.id)).filter((x): x is Entity<{ date: string; amount: number }> => !!x && x.type === 'transaction'), [entity.id]);
  const renewal = useLive((os) => {
    const c = os.cycles.forEntity(entity.id).find((x) => x.template === 'subscription.renewal');
    return c ? { cycle: c, status: os.cycles.status(c) } : null;
  }, [entity.id, entity.version]);
  const year = String(new Date().getFullYear());
  const paidYtd = posted.filter((t) => t.data.date?.startsWith(year)).reduce((a, t) => a + (t.data.amount ?? 0), 0);
  const days = Math.round((new Date(`${s.data.nextBillingAt}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  const active = entity.status === 'active' || entity.status == null;
  const needsHand = active && s.data.autoPost === false && days <= 3;

  const markPaid = () => {
    if (!renewal) return;
    const d = logDone(ctx, renewal.cycle.id, { cost: s.data.amount, asExpense: true, note: 'Paid' });
    toast.show({ message: `${s.data.name} paid · ${ctx.format.currency(s.data.amount, s.data.currency)}`, icon: 'check', undo: () => undoLoggedDone(ctx, d) });
  };
  const setStatus = (to: string, msg: string) => {
    const prev = entity.status;
    ctx.entities.setStatus(entity.id, to);
    toast.show({ message: msg, icon: to === 'active' ? 'check' : 'clock', undo: () => void ctx.entities.setStatus(entity.id, prev ?? 'active') });
  };
  return (
    <View style={{ gap: 16 }}>
      <StatTrio
        stats={[
          { label: 'Per month', value: ctx.format.currency(perMonth(s.data.amount, s.data.rrule), s.data.currency), caption: `${ctx.format.currency(s.data.amount, s.data.currency)} a bill` },
          { label: 'Next bill', value: !active ? '—' : days <= 0 ? 'Due' : String(days), unit: active && days > 0 ? (days === 1 ? 'day' : 'days') : undefined, caption: active ? format(new Date(`${s.data.nextBillingAt}T00:00:00`), 'EEE d MMM') : (entity.status ?? ''), tone: active && days <= 3 ? 'alert' : undefined },
          { label: `Paid ${year}`, value: ctx.format.currency(paidYtd, s.data.currency), caption: `${posted.length} bill${posted.length === 1 ? '' : 's'} logged` },
        ]}
      />
      {needsHand ? (
        <AttentionCard
          eyebrow="Renewal"
          urgent={days <= 0}
          title={days <= 0 ? `${s.data.name} is due` : `${s.data.name} renews in ${days} day${days === 1 ? '' : 's'}`}
          meta="Auto-post is off — mark it paid when you pay"
          estimate={ctx.format.currency(s.data.amount, s.data.currency)}
          estimateLabel="Amount"
          primary={{ label: 'Mark paid', icon: 'check', onPress: markPaid }}
          secondary={{ label: 'Pause', icon: 'clock', onPress: () => setStatus('paused', `${s.data.name} paused`) }}
        />
      ) : null}
      <QuickActions
        actions={[
          ...(active && renewal ? [{ label: 'Mark paid', icon: 'check' as const, onPress: markPaid }] : []),
          active ? { label: 'Pause', icon: 'clock', onPress: () => setStatus('paused', `${s.data.name} paused — out of Upkeep`) } : { label: 'Resume', icon: 'repeat', onPress: () => setStatus('active', `${s.data.name} resumed`) },
          ...(s.data.url ? [{ label: 'Manage', icon: 'link' as const, onPress: () => void Linking.openURL(s.data.url!) }] : []),
          ...(entity.status !== 'cancelled' ? [{ label: 'Cancel', icon: 'x' as const, onPress: () => setStatus('cancelled', `${s.data.name} cancelled`) }] : []),
        ]}
      />
      {posted.length ? (
        <Section title="Billing history" meta={`${posted.length}`}>
          <RowList>
            {posted.slice(0, 8).map((e) => (
              <EntityRow key={e.id} entity={e} />
            ))}
          </RowList>
        </Section>
      ) : null}
    </View>
  );
}
