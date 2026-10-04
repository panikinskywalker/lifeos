import React from 'react';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import { useOS } from '../hooks';
import { RowItem, useToast } from '../kit';
import { SwipeToDelete } from './SwipeToDelete';
import { tintForModule } from '../theme/moduleTint';

/**
 * Generic list row for any entity: module-tinted icon-box, title, subtitle
 * from summary fields, amount on the right when the type has a currency
 * field, and a status chip when the record is past its first status.
 */
export function RecordRow({ entity, onPress, showType, value, subtitle, swipe = true }: { entity: ObjectRecord; first?: boolean; last?: boolean; onPress?: () => void; showType?: boolean; value?: string | null; subtitle?: string | null; /** Swipe left to delete (with Undo). */ swipe?: boolean }) {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const def = os.registry.objects.get(entity.object);
  const tint = tintForModule(def?.module);
  const currencyField = def?.fields.find((f) => f.type === 'currency');
  const amount = currencyField ? (entity.data[currencyField.key] as number | undefined) : undefined;
  // Canvas: a list row shows the record's category as a small tag in its module tint.
  const tagField = def?.fields.find((f) => f.type === 'select' && f.summary && entity.data[f.key] != null && entity.data[f.key] !== '');
  const tagLabel = tagField ? tagField.options?.find((o) => o.value === entity.data[tagField.key])?.label ?? String(entity.data[tagField.key]) : null;
  const statusDef = def?.statuses?.find((s) => s.value === entity.status);
  const sub =
    subtitle !== undefined
      ? subtitle
      : (entity.subtitle && entity.subtitle !== tagLabel ? entity.subtitle : null) ||
        def?.fields
          .filter((f) => f.summary && f.key !== currencyField?.key && f.key !== tagField?.key)
          .map((f) => {
            const v = entity.data[f.key];
            if (v == null || v === '') return null;
            if (f.type === 'select') return f.options?.find((o) => o.value === v)?.label ?? String(v);
            if (f.type === 'date') return os.format.date(String(v), 'short');
            if (f.type === 'relation') return os.records.ref(String(v))?.title ?? null;
            return String(v);
          })
          .filter(Boolean)
          .join(' · ') ||
        (entity.occurredAt ? os.format.date(entity.occurredAt, 'relative') : null);
  const kind = entity.data.kind as string | undefined;
  const money = amount != null ? os.format.currency(amount, (entity.data.currency as string) || undefined) : null;
  const shownValue = value !== undefined ? value : money != null ? `${kind === 'expense' ? '−' : kind === 'income' ? '+' : ''}${money}` : undefined;
  const status = statusDef && def?.statuses && def.statuses.length > 1 && statusDef.value !== def.statuses[0]!.value ? statusDef.label : null;
  const row = (
    <RowItem
      title={entity.title}
      subtitle={[showType ? def?.label : null, status, sub].filter(Boolean).join(' · ') || null}
      tag={tagLabel ? { label: tagLabel, tint } : undefined}
      icon={def?.icon}
      tint={tint}
      value={shownValue}
      strong={amount != null && value === undefined}
      valueTone={kind === 'income' ? 'ok' : 'default'}
      chevron={shownValue ? false : undefined}
      onPress={onPress ?? (() => router.push(`/entity/${entity.object}/${entity.id}`))}
    />
  );
  if (!swipe) return row;
  const remove = () => {
    os.records.delete(entity.id);
    toast.show({ message: `Deleted ${entity.title}`, icon: 'trash', undo: () => os.records.restore(entity.id) });
  };
  return <SwipeToDelete onDelete={remove}>{row}</SwipeToDelete>;
}
