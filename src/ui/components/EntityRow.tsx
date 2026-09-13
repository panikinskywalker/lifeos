import React from 'react';
import { useRouter } from 'expo-router';
import type { Entity } from '@core/domain/types';
import { useOS } from '../hooks';
import { Row } from './primitives';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Generic list row for any entity: icon in module colour, title, subtitle or
 * summary fields, and a right-hand value if the type has a currency field.
 * Modules can pass `render` overrides but rarely need to.
 */
export function EntityRow({ entity, first, last, onPress, showType, value, subtitle }: { entity: Entity; first?: boolean; last?: boolean; onPress?: () => void; showType?: boolean; value?: string | null; subtitle?: string | null }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const def = os.registry.entityTypes.get(entity.type);
  const accent = os.registry.colorFor(entity.type) ?? t.colors.tint;
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
  const valueColor = kind === 'income' ? t.colors.success : undefined;
  return (
    <Row
      title={entity.title}
      subtitle={showType && def ? `${def.label}${sub ? ` · ${sub}` : ''}` : sub}
      icon={def?.icon}
      iconColor={accent}
      value={value !== undefined ? value : amount != null ? `${kind === 'expense' ? '−' : kind === 'income' ? '+' : ''}${os.format.currency(amount, (entity.data.currency as string) || undefined)}` : undefined}
      valueColor={valueColor}
      first={first}
      last={last}
      badge={statusDef && def?.statuses && def.statuses.length > 1 && statusDef.value !== def.statuses[0].value ? statusDef.label : undefined}
      badgeColor={statusDef?.color ?? accent}
      onPress={onPress ?? (() => router.push(`/entity/${entity.type}/${entity.id}`))}
    />
  );
}
