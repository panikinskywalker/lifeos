import React from 'react';
import { useRouter } from 'expo-router';
import type { Entity } from '@core/domain/types';
import { useOS } from '../hooks';
import { RowItem } from '../kit';
import { tintForModule } from '../theme/moduleTint';

/**
 * Generic list row for any entity: module-tinted icon-box, title, subtitle
 * from summary fields, amount on the right when the type has a currency
 * field, and a status chip when the record is past its first status.
 */
export function EntityRow({ entity, last, onPress, showType, value, subtitle }: { entity: Entity; first?: boolean; last?: boolean; onPress?: () => void; showType?: boolean; value?: string | null; subtitle?: string | null }) {
  const os = useOS();
  const router = useRouter();
  const def = os.registry.entityTypes.get(entity.type);
  const currencyField = def?.fields.find((f) => f.type === 'currency');
  const amount = currencyField ? (entity.data[currencyField.key] as number | undefined) : undefined;
  const statusDef = def?.statuses?.find((s) => s.value === entity.status);
  const sub =
    subtitle !== undefined
      ? subtitle
      : entity.subtitle ||
        def?.fields
          .filter((f) => f.summary && f.key !== currencyField?.key)
          .map((f) => {
            const v = entity.data[f.key];
            if (v == null || v === '') return null;
            if (f.type === 'select') return f.options?.find((o) => o.value === v)?.label ?? String(v);
            if (f.type === 'date') return os.format.date(String(v), 'short');
            if (f.type === 'relation') return os.entities.ref(String(v))?.title ?? null;
            return String(v);
          })
          .filter(Boolean)
          .join(' · ') ||
        (entity.occurredAt ? os.format.date(entity.occurredAt, 'relative') : null);
  const kind = entity.data.kind as string | undefined;
  const money = amount != null ? os.format.currency(amount, (entity.data.currency as string) || undefined) : null;
  const shownValue = value !== undefined ? value : money != null ? `${kind === 'expense' ? '−' : kind === 'income' ? '+' : ''}${money}` : undefined;
  const status = statusDef && def?.statuses && def.statuses.length > 1 && statusDef.value !== def.statuses[0]!.value ? statusDef.label : null;
  return (
    <RowItem
      title={entity.title}
      subtitle={[showType ? def?.label : null, status, sub].filter(Boolean).join(' · ') || null}
      icon={def?.icon}
      tint={tintForModule(def?.module)}
      value={shownValue}
      valueTone={kind === 'income' ? 'ok' : 'default'}
      divider={!last}
      onPress={onPress ?? (() => router.push(`/entity/${entity.type}/${entity.id}`))}
    />
  );
}
