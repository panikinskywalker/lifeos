import { Linking } from 'react-native';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { AttentionCard, useToast } from '@ui/kit';
import { cadenceLabel, daysSince, type PersonData } from '@modules/crm';

/**
 * Keep in touch, under the Person · Profile hero: a nudge when the
 * keep-in-touch cycle is due, with Call (when there is a number) and Log
 * contact. Nothing when you are in touch.
 */
export function PersonSection({ entity, ctx }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) {
  const toast = useToast();
  const p = entity as ObjectRecord<PersonData>;
  const contact = useLive((os) => {
    const c = os.cycles.forEntity(entity.id).find((x) => x.template === 'person.contact' && x.enabled);
    return c ? { cycle: c, status: os.cycles.status(c) } : null;
  }, [entity.id, entity.version]);
  if (!contact || contact.status.state !== 'overdue') return null;
  const days = daysSince(p.data.lastContactAt);
  const every = Number(p.data.contactEvery) || null;
  const first = entity.title.split(' ')[0];
  const tel = p.data.phone?.replace(/[^+\d]/g, '');
  const logContact = () => {
    const prev = p.data.lastContactAt;
    ctx.records.update<PersonData>(entity.id, { data: { lastContactAt: new Date().toISOString().slice(0, 10) } });
    toast.show({ message: `Logged contact with ${first}`, icon: 'check', undo: () => void ctx.records.update<PersonData>(entity.id, { data: { lastContactAt: prev } }) });
  };
  return (
    <AttentionCard
      eyebrow="Keep in touch"
      urgent={days != null && every != null && days > every * 1.5}
      title={days != null ? `${days} days since you last spoke` : `Time to catch up with ${first}`}
      meta={cadenceLabel(p.data.contactEvery) ? `You aim for ${cadenceLabel(p.data.contactEvery)!.toLowerCase()}` : undefined}
      primary={tel ? { label: 'Call', icon: 'phone', onPress: () => void Linking.openURL(`tel:${tel}`) } : { label: 'Log contact', icon: 'check', onPress: logContact }}
      secondary={tel ? { label: 'Log contact', icon: 'check', onPress: logContact } : undefined}
    />
  );
}
